import { inflateRawSync } from "node:zlib";

export interface ZipPdfEntry {
  name: string;
  data: Buffer;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_ENTRIES = 250;
const MAX_PDF_BYTES = 30 * 1024 * 1024;

/** Minimal ZIP reader for Tesla export bundles (stored/deflated PDF entries). */
export function readPdfEntriesFromZip(zip: Buffer): ZipPdfEntry[] {
  const eocd = findSignatureBackwards(zip, EOCD);
  if (eocd < 0 || eocd + 22 > zip.length) throw new Error("ZIP: end record missing");
  const totalEntries = Math.min(zip.readUInt16LE(eocd + 10), MAX_ENTRIES);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  const out: ZipPdfEntry[] = [];
  let offset = centralOffset;

  for (let i = 0; i < totalEntries && offset + 46 <= zip.length; i += 1) {
    if (zip.readUInt32LE(offset) !== CENTRAL) break;
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (isSafePdfName(name) && uncompressedSize <= MAX_PDF_BYTES) {
      const entry = readLocalEntry(zip, localOffset, method, compressedSize, uncompressedSize);
      if (entry) out.push({ name, data: entry });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

function readLocalEntry(
  zip: Buffer,
  offset: number,
  method: number,
  compressedSize: number,
  uncompressedSize: number,
): Buffer | null {
  if (offset + 30 > zip.length || zip.readUInt32LE(offset) !== LOCAL) return null;
  const nameLength = zip.readUInt16LE(offset + 26);
  const extraLength = zip.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + compressedSize;
  if (start < 0 || end > zip.length) return null;
  const compressed = zip.subarray(start, end);
  let data: Buffer;
  if (method === 0) data = Buffer.from(compressed);
  else if (method === 8) {
    try {
      data = inflateRawSync(compressed, { maxOutputLength: MAX_PDF_BYTES + 1 });
    } catch {
      return null;
    }
  } else return null;
  if (data.length > MAX_PDF_BYTES || (uncompressedSize > 0 && data.length !== uncompressedSize)) return null;
  return data;
}

function isSafePdfName(name: string): boolean {
  const normalized = name.replace(/\\/g, "/");
  return normalized.toLowerCase().endsWith(".pdf") && !normalized.startsWith("/") && !normalized.split("/").includes("..");
}

function findSignatureBackwards(buffer: Buffer, signature: number): number {
  const min = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 4; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === signature) return i;
  }
  return -1;
}
