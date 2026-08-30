import "server-only";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const INVOICE_ROOT = "/data/invoices";
const TESLA_ROOT = path.join(INVOICE_ROOT, "tesla");
const INDEX_PATH = path.join(TESLA_ROOT, "index.json");

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

export interface InvoiceIndex {
  version: 1;
  updatedAt: string;
  invoices: TeslaInvoiceRecord[];
}

export async function readInvoiceIndex(): Promise<InvoiceIndex> {
  try {
    const parsed = JSON.parse(await readFile(INDEX_PATH, "utf8")) as InvoiceIndex;
    if (parsed.version === 1 && Array.isArray(parsed.invoices)) return parsed;
  } catch {
    // Feature not mounted or no imports yet.
  }
  return { version: 1, updatedAt: new Date(0).toISOString(), invoices: [] };
}

export function invoicesForMonth(index: InvoiceIndex, month: string): TeslaInvoiceRecord[] {
  return index.invoices.filter((invoice) => (invoice.occurredAt ?? invoice.importedAt).slice(0, 7) === month);
}

export async function readArchivedInvoice(id: string): Promise<{ record: TeslaInvoiceRecord; bytes: Buffer } | null> {
  const index = await readInvoiceIndex();
  const record = index.invoices.find((invoice) => invoice.id === id);
  if (!record) return null;
  const absolute = archivedAbsolutePath(record.archivedPath);
  if (!absolute) return null;
  try {
    return { record, bytes: await readFile(absolute) };
  } catch {
    return null;
  }
}

export async function deleteArchivedInvoices(ids: string[]): Promise<{
  deleted: TeslaInvoiceRecord[];
  remaining: TeslaInvoiceRecord[];
  missingFiles: string[];
}> {
  const wanted = new Set(ids);
  const index = await readInvoiceIndex();
  const deleted = index.invoices.filter((invoice) => wanted.has(invoice.id));
  const remaining = index.invoices.filter((invoice) => !wanted.has(invoice.id));
  const missingFiles: string[] = [];

  for (const invoice of deleted) {
    const absolute = archivedAbsolutePath(invoice.archivedPath);
    if (!absolute) {
      missingFiles.push(invoice.id);
      continue;
    }
    try {
      await unlink(absolute);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        missingFiles.push(invoice.id);
      } else {
        throw error;
      }
    }
  }

  if (deleted.length > 0) {
    await writeInvoiceIndex({
      version: 1,
      updatedAt: new Date().toISOString(),
      invoices: remaining,
    });
  }

  return { deleted, remaining, missingFiles };
}

async function writeInvoiceIndex(index: InvoiceIndex): Promise<void> {
  await mkdir(TESLA_ROOT, { recursive: true });
  index.updatedAt = new Date().toISOString();
  index.invoices.sort((a, b) => (b.occurredAt ?? b.importedAt).localeCompare(a.occurredAt ?? a.importedAt));
  const temp = `${INDEX_PATH}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(index, null, 2)}\n`, { encoding: "utf8", mode: 0o640 });
  await rename(temp, INDEX_PATH);
}

function archivedAbsolutePath(archivedPath: string): string | null {
  const root = path.resolve(INVOICE_ROOT);
  const absolute = path.resolve(INVOICE_ROOT, archivedPath);
  return absolute.startsWith(`${root}${path.sep}`) ? absolute : null;
}
