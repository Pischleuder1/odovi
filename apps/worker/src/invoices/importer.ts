import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { and, eq, gte, isNull, lte, ne, or } from "drizzle-orm";
import { chargeSessions, type Db } from "@odovi/db";
import { recordSyncRun } from "../sync/state.js";
import { extractPdfText, parseTeslaInvoiceMetadata } from "./pdfText.js";
import { readPdfEntriesFromZip } from "./zip.js";

const IMPORT_DIR = "/data/invoice-import";
const ARCHIVE_ROOT = "/data/invoices";
const TESLA_ARCHIVE = path.join(ARCHIVE_ROOT, "tesla");
const INDEX_PATH = path.join(TESLA_ARCHIVE, "index.json");

export type InvoiceMatchConfidence = "matched" | "probable" | "unmatched";

export interface TeslaInvoiceRecord {
  id: string;
  sha256: string;
  sourceFile: string;
  archivedPath: string;
  importedAt: string;
  invoiceNumber: string | null;
  occurredAt: string | null;
  hasExactTime: boolean;
  amount: number | null;
  currency: string | null;
  energyKwh: number | null;
  location: string | null;
  textQuality: "parsed" | "limited";
  match: {
    chargeSessionId: number | null;
    confidence: InvoiceMatchConfidence;
    score: number;
  };
}

interface InvoiceIndex {
  version: 1;
  updatedAt: string;
  invoices: TeslaInvoiceRecord[];
}

export async function runTeslaInvoiceImport(db: Db): Promise<void> {
  try {
    await access(IMPORT_DIR);
  } catch {
    return; // Feature is opt-in by mounting /data/invoice-import.
  }

  await mkdir(TESLA_ARCHIVE, { recursive: true });
  const index = await readIndex();
  const knownHashes = new Set(index.invoices.map((invoice) => invoice.sha256));
  const files = (await readdir(IMPORT_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:pdf|zip)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  let imported = 0;
  try {
    for (const name of files) {
      const absolute = path.join(IMPORT_DIR, name);
      const info = await stat(absolute);
      const source = await readFile(absolute);
      const pdfs = name.toLowerCase().endsWith(".zip")
        ? readPdfEntriesFromZip(source).map((entry) => ({
            sourceName: `${name}::${entry.name}`,
            data: entry.data,
          }))
        : [{ sourceName: name, data: source }];

      for (const pdf of pdfs) {
        const sha256 = createHash("sha256").update(pdf.data).digest("hex");
        if (knownHashes.has(sha256)) continue;
        const record = await importPdf(db, pdf.data, pdf.sourceName, sha256, info.mtime);
        index.invoices.push(record);
        knownHashes.add(sha256);
        imported += 1;
      }
      await moveProcessed(absolute, name);
    }
    if (imported > 0) await writeIndex(index);
    await recordSyncRun(db, "tesla_invoice_import", "archive", {
      status: "ok",
      rowsUpserted: imported,
    });
  } catch (error) {
    await recordSyncRun(db, "tesla_invoice_import", "archive", {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      rowsUpserted: imported,
    });
    console.error("[invoice-import] import failed", error);
  }
}

async function importPdf(
  db: Db,
  pdf: Buffer,
  sourceFile: string,
  sha256: string,
  sourceMtime: Date,
): Promise<TeslaInvoiceRecord> {
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error(`${sourceFile}: not a PDF`);
  }
  const text = extractPdfText(pdf);
  const metadata = parseTeslaInvoiceMetadata(text, sourceFile);
  const matched = await matchChargeSession(db, metadata);
  const id = sha256.slice(0, 16);
  const archiveDate = metadata.occurredAt ?? sourceMtime;
  const year = String(archiveDate.getUTCFullYear());
  const month = String(archiveDate.getUTCMonth() + 1).padStart(2, "0");
  const targetDir = path.join(TESLA_ARCHIVE, year, month);
  await mkdir(targetDir, { recursive: true });
  const datePart = metadata.occurredAt?.toISOString().slice(0, 10) ?? archiveDate.toISOString().slice(0, 10);
  const invoicePart = safePart(metadata.invoiceNumber ?? id);
  const target = path.join(targetDir, `Tesla_${datePart}_${invoicePart}_${id}.pdf`);
  await writeFile(target, pdf, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });

  if (
    matched.confidence === "matched" &&
    matched.chargeSessionId != null &&
    metadata.amount != null
  ) {
    await db
      .update(chargeSessions)
      .set({
        cost: metadata.amount.toFixed(2),
        currency: metadata.currency ?? "EUR",
        costSource: "invoice",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(chargeSessions.id, matched.chargeSessionId),
          or(isNull(chargeSessions.costSource), ne(chargeSessions.costSource, "manual")),
        ),
      );
  }

  return {
    id,
    sha256,
    sourceFile,
    archivedPath: path.relative(ARCHIVE_ROOT, target).split(path.sep).join("/"),
    importedAt: new Date().toISOString(),
    invoiceNumber: metadata.invoiceNumber,
    occurredAt: metadata.occurredAt?.toISOString() ?? null,
    hasExactTime: metadata.hasExactTime,
    amount: metadata.amount,
    currency: metadata.currency,
    energyKwh: metadata.energyKwh,
    location: metadata.location,
    textQuality: metadata.textQuality,
    match: matched,
  };
}

async function matchChargeSession(
  db: Db,
  metadata: ReturnType<typeof parseTeslaInvoiceMetadata>,
): Promise<TeslaInvoiceRecord["match"]> {
  if (metadata.occurredAt == null || metadata.textQuality === "limited") {
    return { chargeSessionId: null, confidence: "unmatched", score: 0 };
  }
  const windowMs = 36 * 60 * 60 * 1000;
  const from = new Date(metadata.occurredAt.getTime() - windowMs);
  const to = new Date(metadata.occurredAt.getTime() + windowMs);
  const candidates = await db
    .select({
      id: chargeSessions.id,
      startTime: chargeSessions.startTime,
      address: chargeSessions.address,
      energyAddedKwh: chargeSessions.energyAddedKwh,
      cost: chargeSessions.cost,
    })
    .from(chargeSessions)
    .where(and(gte(chargeSessions.startTime, from), lte(chargeSessions.startTime, to)));

  let best: { id: number; score: number } | null = null;
  for (const candidate of candidates) {
    let score = scoreTime(metadata.occurredAt, metadata.hasExactTime, candidate.startTime);
    score += scoreNumeric(metadata.energyKwh, candidate.energyAddedKwh, 0.03, 0.1, 30, 20, 10);
    score += scoreMoney(metadata.amount, candidate.cost);
    score += scoreLocation(metadata.location, candidate.address);
    if (best == null || score > best.score) best = { id: candidate.id, score };
  }
  if (best == null) return { chargeSessionId: null, confidence: "unmatched", score: 0 };
  const confidence: InvoiceMatchConfidence = best.score >= 70 ? "matched" : best.score >= 45 ? "probable" : "unmatched";
  return {
    chargeSessionId: confidence === "unmatched" ? null : best.id,
    confidence,
    score: best.score,
  };
}

function scoreTime(invoice: Date, exact: boolean, charge: Date): number {
  const diffMinutes = Math.abs(invoice.getTime() - charge.getTime()) / 60_000;
  if (!exact) {
    return invoice.toISOString().slice(0, 10) === charge.toISOString().slice(0, 10) ? 35 : 10;
  }
  if (diffMinutes <= 30) return 50;
  if (diffMinutes <= 120) return 42;
  if (diffMinutes <= 360) return 28;
  if (diffMinutes <= 1_440) return 12;
  return 0;
}

function scoreNumeric(
  expected: number | null,
  actual: number | null,
  tight: number,
  medium: number,
  tightScore: number,
  mediumScore: number,
  looseScore: number,
): number {
  if (expected == null || actual == null || expected <= 0) return 0;
  const relative = Math.abs(actual - expected) / expected;
  if (relative <= tight) return tightScore;
  if (relative <= medium) return mediumScore;
  if (relative <= 0.2) return looseScore;
  return 0;
}

function scoreMoney(expected: number | null, actual: string | null): number {
  if (expected == null || actual == null) return 0;
  const diff = Math.abs(expected - Number(actual));
  if (diff <= 0.05) return 15;
  if (diff <= 1) return 8;
  return 0;
}

function scoreLocation(invoice: string | null, address: string | null): number {
  if (!invoice || !address) return 0;
  const a = tokens(invoice);
  const b = tokens(address);
  if (a.size === 0 || b.size === 0) return 0;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap >= 2 ? 20 : overlap === 1 ? 10 : 0;
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase("de-DE")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && token !== "tesla" && token !== "supercharger"),
  );
}

async function readIndex(): Promise<InvoiceIndex> {
  try {
    const parsed = JSON.parse(await readFile(INDEX_PATH, "utf8")) as InvoiceIndex;
    if (parsed.version === 1 && Array.isArray(parsed.invoices)) return parsed;
  } catch {
    // First run / corrupt index: preserve PDFs and start a new metadata index.
  }
  return { version: 1, updatedAt: new Date(0).toISOString(), invoices: [] };
}

async function writeIndex(index: InvoiceIndex): Promise<void> {
  index.updatedAt = new Date().toISOString();
  index.invoices.sort((a, b) => (b.occurredAt ?? b.importedAt).localeCompare(a.occurredAt ?? a.importedAt));
  const temp = `${INDEX_PATH}.tmp`;
  await writeFile(temp, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await rename(temp, INDEX_PATH);
}

async function moveProcessed(absolute: string, name: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const targetDir = path.join(IMPORT_DIR, "processed", day);
  await mkdir(targetDir, { recursive: true });
  let target = path.join(targetDir, safePart(name));
  try {
    await access(target);
    target = path.join(targetDir, `${Date.now()}_${safePart(name)}`);
  } catch {
    // Target does not exist.
  }
  await rename(absolute, target);
}

function safePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 100) || "invoice";
}
