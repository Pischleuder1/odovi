import { inflateSync } from "node:zlib";

export interface ParsedInvoiceMetadata {
  invoiceNumber: string | null;
  occurredAt: Date | null;
  hasExactTime: boolean;
  amount: number | null;
  currency: string | null;
  energyKwh: number | null;
  location: string | null;
  textQuality: "parsed" | "limited";
}

/**
 * Best-effort text extraction for text-based PDF invoices without adding a PDF
 * dependency. It understands literal/hex PDF strings and the common PDF stream
 * filters used by invoice generators (including ReportLab's
 * ASCII85Decode+FlateDecode combination). PDFs using custom CID-only font maps
 * may still yield limited text; those records are archived but deliberately not
 * force-matched.
 */
export function extractPdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const fragments: string[] = [];
  // Some generators put `endstream` directly after an ASCII85 `~>` terminator,
  // without a line break. Do not require a newline before endstream.
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw)) != null) {
    const streamStart = match.index;
    const dictStart = Math.max(0, raw.lastIndexOf("<<", streamStart));
    const dictionary = raw.slice(dictStart, streamStart);
    const encodedBytes = Buffer.from(match[1]!, "latin1");
    try {
      const decodedBytes = decodePdfStream(encodedBytes, dictionary);
      fragments.push(...extractTextOperators(decodedBytes.toString("latin1")));
    } catch {
      // Keep scanning other streams; one unsupported stream must not reject the PDF.
    }
  }

  // Some producers keep useful strings outside content streams (metadata/forms).
  // Strip the stream bodies first so encoded/compressed bytes cannot be mistaken
  // for literal PDF strings and pollute the extracted text.
  const outsideStreams = raw.replace(/stream\r?\n[\s\S]*?endstream/g, "");
  fragments.push(...extractTextOperators(outsideStreams));
  return normalizeText(fragments.join("\n"));
}

function decodePdfStream(bytes: Buffer, dictionary: string): Buffer {
  const filters = [...dictionary.matchAll(/\/(ASCII85Decode|ASCIIHexDecode|FlateDecode)\b/g)].map(
    (match) => match[1]!,
  );

  // If the dictionary declares filters we do not understand, do not feed the
  // encoded stream to the text parser as if it were plain text.
  const declaredFilterCount = [...dictionary.matchAll(/\/[A-Za-z0-9]+Decode\b/g)].length;
  if (declaredFilterCount > filters.length) {
    throw new Error("Unsupported PDF stream filter");
  }

  let decoded = bytes;
  for (const filter of filters) {
    if (filter === "ASCII85Decode") {
      decoded = decodeAscii85(decoded.toString("latin1"));
    } else if (filter === "ASCIIHexDecode") {
      decoded = decodeAsciiHex(decoded.toString("latin1"));
    } else if (filter === "FlateDecode") {
      decoded = inflateSync(decoded);
    }
  }
  return decoded;
}

function decodeAscii85(input: string): Buffer {
  let value = input.replace(/\s+/g, "");
  if (value.startsWith("<~")) value = value.slice(2);
  const terminator = value.indexOf("~>");
  if (terminator >= 0) value = value.slice(0, terminator);

  const out: number[] = [];
  let group: number[] = [];
  for (const char of value) {
    if (char === "z") {
      if (group.length !== 0) throw new Error("Invalid ASCII85 z inside group");
      out.push(0, 0, 0, 0);
      continue;
    }
    const code = char.charCodeAt(0);
    if (code < 33 || code > 117) continue;
    group.push(code - 33);
    if (group.length === 5) {
      appendAscii85Group(out, group, 4);
      group = [];
    }
  }

  if (group.length === 1) throw new Error("Invalid ASCII85 tail");
  if (group.length > 1) {
    const bytesToKeep = group.length - 1;
    while (group.length < 5) group.push(84); // `u` padding.
    appendAscii85Group(out, group, bytesToKeep);
  }
  return Buffer.from(out);
}

function appendAscii85Group(out: number[], group: number[], bytesToKeep: number): void {
  let value = 0;
  for (const digit of group) value = value * 85 + digit;
  const bytes = [
    Math.floor(value / 0x1000000) & 0xff,
    Math.floor(value / 0x10000) & 0xff,
    Math.floor(value / 0x100) & 0xff,
    value & 0xff,
  ];
  out.push(...bytes.slice(0, bytesToKeep));
}

function decodeAsciiHex(input: string): Buffer {
  let clean = input.replace(/\s+/g, "");
  const terminator = clean.indexOf(">");
  if (terminator >= 0) clean = clean.slice(0, terminator);
  if (clean.length % 2 !== 0) clean += "0";
  return Buffer.from(clean, "hex");
}

function extractTextOperators(content: string): string[] {
  const out: string[] = [];
  const literal = /\((?:\\.|[^\\)])*\)/g;
  const hex = /(?<!<)<([0-9a-fA-F\s]{4,})>(?!>)/g;
  for (const value of content.match(literal) ?? []) {
    const decoded = decodeLiteral(value.slice(1, -1));
    if (looksUseful(decoded)) out.push(decoded);
  }
  let m: RegExpExecArray | null;
  while ((m = hex.exec(content)) != null) {
    const decoded = decodeHex(m[1]!);
    if (looksUseful(decoded)) out.push(decoded);
  }
  return out;
}

function decodeLiteral(value: string): string {
  return value
    .replace(/\\([0-7]{1,3})/g, (_m, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    )
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\([()\\])/g, "$1");
}

function decodeHex(value: string): string {
  const clean = value.replace(/\s+/g, "");
  if (clean.length % 2 !== 0) return "";
  const bytes = Buffer.from(clean, "hex");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      text += String.fromCharCode(bytes.readUInt16BE(i));
    }
    return text;
  }
  const zeroCount = [...bytes].filter((b) => b === 0).length;
  if (bytes.length >= 4 && zeroCount > bytes.length / 4) {
    let text = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      text += String.fromCharCode(bytes.readUInt16BE(i));
    }
    return text;
  }
  return bytes.toString("utf8");
}

function looksUseful(value: string): boolean {
  const printable = value.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return printable.length >= 2 && /[\p{L}\p{N}€$]/u.test(printable);
}

function normalizeText(value: string): string {
  return value
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function parseTeslaInvoiceMetadata(
  text: string,
  fileName: string,
): ParsedInvoiceMetadata {
  const compact = text.replace(/\s+/g, " ").trim();
  const quality: "parsed" | "limited" = compact.length >= 80 ? "parsed" : "limited";
  const date = parseInvoiceDate(compact, fileName);
  return {
    invoiceNumber: firstCapture(compact, [
      /(?:Rechnungsnummer|Rechnung\s*(?:Nr\.?|#)|Invoice\s*(?:number|no\.?|#))\s*[:#]?\s*([A-Z0-9][A-Z0-9._\/-]{3,})/i,
      /\b(INV[-_/]?[A-Z0-9._\/-]{4,})\b/i,
    ]),
    occurredAt: date.date,
    hasExactTime: date.hasExactTime,
    amount: parseAmount(compact),
    currency: /(?:\bEUR\b|€)/i.test(compact) ? "EUR" : null,
    energyKwh: parseEnergy(compact),
    location: parseLocation(compact),
    textQuality: quality,
  };
}

function parseInvoiceDate(
  text: string,
  fileName: string,
): { date: Date | null; hasExactTime: boolean } {
  // Prefer a timestamp from the charging line over the invoice/issue date. This
  // materially improves matching to the TeslaMate charge session.
  for (const input of [text, fileName]) {
    let m = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})[ T,]+(\d{1,2}):(\d{2})\b/i.exec(input);
    if (m) return makeDate(m[1]!, m[2]!, m[3]!, m[4], m[5]);
    m = /\b(\d{1,2})[./](\d{1,2})[./](20\d{2})[, T]+(\d{1,2}):(\d{2})\b/i.exec(input);
    if (m) return makeDate(m[3]!, m[2]!, m[1]!, m[4], m[5]);
  }

  for (const input of [text, fileName]) {
    let m = /(?:Ladedatum|Ladezeit|Charging date|Charge date|Leistungsdatum|Rechnungsdatum|Datum|Date)?\s*[:\-]?\s*(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/i.exec(input);
    if (m) return makeDate(m[1]!, m[2]!, m[3]!);
    m = /(?:Ladedatum|Ladezeit|Charging date|Charge date|Leistungsdatum|Rechnungsdatum|Datum|Date)?\s*[:\-]?\s*(\d{1,2})[./](\d{1,2})[./](20\d{2})/i.exec(input);
    if (m) return makeDate(m[3]!, m[2]!, m[1]!);
  }
  return { date: null, hasExactTime: false };
}

function makeDate(
  year: string,
  month: string,
  day: string,
  hour?: string,
  minute?: string,
): { date: Date | null; hasExactTime: boolean } {
  const hasExactTime = hour != null && minute != null;
  const hh = hasExactTime ? Number(hour) : 12;
  const mm = hasExactTime ? Number(minute) : 0;

  // Tesla invoices print the charging timestamp in local wall-clock time.
  // Convert that local time to UTC using Odovi's configured application timezone
  // before storing it. Treating 09:15 as 09:15Z would otherwise render as
  // 11:15 in Europe during daylight-saving time.
  const timeZone = process.env.APP_TIMEZONE?.trim() || "Europe/Berlin";
  const date = localWallClockToUtc(
    Number(year),
    Number(month),
    Number(day),
    hh,
    mm,
    timeZone,
  );

  return Number.isNaN(date.getTime())
    ? { date: null, hasExactTime: false }
    : { date, hasExactTime };
}

function localWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let offset = timeZoneOffsetMs(new Date(wallClockAsUtc), timeZone);
  let utcMs = wallClockAsUtc - offset;

  // Re-evaluate once at the resolved instant so DST transitions use the correct
  // side of the boundary.
  const resolvedOffset = timeZoneOffsetMs(new Date(utcMs), timeZone);
  if (resolvedOffset !== offset) {
    offset = resolvedOffset;
    utcMs = wallClockAsUtc - offset;
  }

  return new Date(utcMs);
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const representedAsUtc = Date.UTC(
      Number(values.get("year")),
      Number(values.get("month")) - 1,
      Number(values.get("day")),
      Number(values.get("hour")),
      Number(values.get("minute")),
      Number(values.get("second")),
    );
    const roundedInput = Math.floor(date.getTime() / 1000) * 1000;
    return representedAsUtc - roundedInput;
  } catch {
    // Keep imports functional even if an invalid timezone was configured.
    return 0;
  }
}

function parseAmount(text: string): number | null {
  const labelled = [
    /(?:Gesamtbetrag|Gesamtsumme|Zu zahlen|Total amount|Amount due|Grand total|Total)(?:\s*\([^)]{1,40}\))?\s*[:\s]*((?:EUR|€)?\s*-?\d[\d. ]*[,.]\d{2})\s*(?:EUR|€)?/gi,
  ];
  for (const re of labelled) {
    const values = [...text.matchAll(re)]
      .map((m) => parseDecimal(m[1]!))
      .filter((n): n is number => n != null);
    if (values.length) return values.at(-1)!;
  }
  const generic = [...text.matchAll(/(-?\d[\d. ]*[,.]\d{2})\s*(EUR|€)/gi)]
    .map((m) => parseDecimal(m[1]!))
    .filter((n): n is number => n != null && n >= 0 && n < 10_000);
  return generic.at(-1) ?? null;
}

function parseEnergy(text: string): number | null {
  const labelled = /(?:Energie|Energy|Geladen|Charged)?\s*[:\s]*([0-9]{1,4}(?:[,.][0-9]{1,3})?)\s*kWh/gi;
  const values = [...text.matchAll(labelled)]
    .map((m) => parseDecimal(m[1]!))
    .filter((n): n is number => n != null && n > 0 && n < 500);
  return values.at(-1) ?? null;
}

function parseLocation(text: string): string | null {
  const patterns = [
    /(?:Tesla\s+)?Supercharger(?:\s*-\s*Nutzung)?\s*:?\s*([^|]{2,100}?)(?=\s+\d{1,2}[./]\d{1,2}[./]20\d{2}\b|\s+20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b|\s+[0-9]{1,4}(?:[,.][0-9]{1,3})?\s*kWh\b|\s(?:Datum|Date|Energie|Energy|Rechnung|Invoice|Gesamt|Total)\b|$)/i,
    /(?:Standort|Location)\s*:\s*([^|]{2,100}?)(?=\s(?:Datum|Date|Energie|Energy|kWh|Rechnung|Invoice|Gesamt|Total)\b|$)/i,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (!m) continue;
    const location = m[1]!.replace(/\s+/g, " ").trim().replace(/[,:;-]+$/, "");
    if (location.length >= 2) return `Supercharger ${location}`;
  }
  return null;
}

function firstCapture(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const value = pattern.exec(text)?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

function parseDecimal(value: string): number | null {
  let clean = value.replace(/EUR|€/gi, "").replace(/\s+/g, "").trim();
  if (clean.includes(",") && clean.includes(".")) {
    if (clean.lastIndexOf(",") > clean.lastIndexOf(".")) clean = clean.replace(/\./g, "").replace(",", ".");
    else clean = clean.replace(/,/g, "");
  } else if (clean.includes(",")) {
    clean = clean.replace(",", ".");
  }
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}
