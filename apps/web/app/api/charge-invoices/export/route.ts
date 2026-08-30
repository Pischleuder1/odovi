import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { createZip } from "../../../../lib/invoiceZip";
import { invoicesForMonth, readInvoiceIndex } from "../../../../lib/invoices";

const ROOT = "/data/invoices";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
    return new Response("Invalid month", { status: 400 });
  }
  const index = await readInvoiceIndex();
  const invoices = invoicesForMonth(index, month);
  if (invoices.length === 0) return new Response("No invoices", { status: 404 });

  const entries: { name: string; data: Buffer }[] = [];
  const manifest = {
    schemaVersion: 1,
    period: month,
    generatedAt: new Date().toISOString(),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      sha256: invoice.sha256,
      invoiceNumber: invoice.invoiceNumber,
      occurredAt: invoice.occurredAt,
      hasExactTime: invoice.hasExactTime,
      amount: invoice.amount,
      currency: invoice.currency,
      energyKwh: invoice.energyKwh,
      location: invoice.location,
      match: invoice.match,
    })),
  };
  entries.push({ name: "manifest.json", data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) });
  entries.push({ name: "Uebersicht.csv", data: Buffer.from(csvFor(invoices), "utf8") });

  for (const invoice of invoices) {
    const absolute = path.resolve(ROOT, invoice.archivedPath);
    if (!absolute.startsWith(`${path.resolve(ROOT)}${path.sep}`)) continue;
    try {
      const bytes = await readFile(absolute);
      entries.push({ name: `Rechnungen/Tesla_${invoice.id}.pdf`, data: bytes });
    } catch {
      // Missing file is visible in manifest/index; omit it from the ZIP instead of failing all exports.
    }
  }

  const zip = createZip(entries);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Tesla_Rechnungen_${month}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function csvFor(invoices: Awaited<ReturnType<typeof readInvoiceIndex>>["invoices"]): string {
  const rows = [
    ["Datum", "Rechnungsnummer", "Ort", "kWh", "Betrag", "Waehrung", "Zuordnung", "Session-ID", "SHA-256"],
    ...invoices.map((invoice) => [
      invoice.occurredAt?.slice(0, 10) ?? "",
      invoice.invoiceNumber ?? "",
      invoice.location ?? "",
      invoice.energyKwh?.toString() ?? "",
      invoice.amount?.toFixed(2) ?? "",
      invoice.currency ?? "",
      invoice.match.confidence,
      invoice.match.chargeSessionId?.toString() ?? "",
      invoice.sha256,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
