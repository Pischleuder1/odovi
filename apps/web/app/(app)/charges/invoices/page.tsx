import Link from "next/link";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClasses } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { todayInAppTz } from "../../../../lib/day";
import { invoicesForMonth, readInvoiceIndex, type TeslaInvoiceRecord } from "../../../../lib/invoices";
import { InvoiceUpload } from "./InvoiceUpload";
import { InvoiceList } from "./InvoiceList";

export const dynamic = "force-dynamic";

export default async function ChargeInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const [t, locale, index] = await Promise.all([
    getTranslations("invoices"),
    getLocale(),
    readInvoiceIndex(),
  ]);
  const sp = await searchParams;
  const fallbackMonth = todayInAppTz().slice(0, 7);
  const month = sp.month && /^20\d{2}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : fallbackMonth;
  const invoices = invoicesForMonth(index, month);
  const matched = invoices.filter((invoice) => invoice.match.confidence === "matched").length;
  const totalByCurrency = summarizeAmounts(invoices);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("subtitle")}</p>
        </div>
        <Link href="/charges" className={buttonClasses("secondary", "md")}>
          <ArrowLeft aria-hidden size={17} /> {t("back")}
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-2">
        <form className="flex items-end gap-2" action="/charges/invoices" method="get">
          <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {t("month")}
            <input
              name="month"
              type="month"
              defaultValue={month}
              className="mt-1 block rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <button className={buttonClasses("secondary", "md")} type="submit">{t("show")}</button>
        </form>
        {invoices.length > 0 && (
          <a href={`/api/charge-invoices/export?month=${month}`} className={buttonClasses("primary", "md", "ml-auto")}>
            <Download aria-hidden size={17} /> {t("exportZip")}
          </a>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("stats.invoices")} value={String(invoices.length)} />
        <Stat label={t("stats.matched")} value={`${matched}/${invoices.length}`} />
        <Stat label={t("stats.energy")} value={formatEnergy(invoices)} />
        <Stat label={t("stats.amount")} value={formatTotals(totalByCurrency, locale)} />
      </div>

      <InvoiceUpload
        labels={{
          title: t("upload.title"),
          hint: t("upload.hint"),
          drop: t("upload.drop"),
          choose: t("upload.choose"),
          supported: t("upload.supported"),
          upload: t("upload.button"),
          uploading: t("upload.uploading"),
          success: t("upload.success"),
          queued: t("upload.queued"),
          invalid: t("upload.invalid"),
          tooLarge: t("upload.tooLarge"),
          failed: t("upload.failed"),
          selected: t("upload.selected"),
          clear: t("upload.clear"),
        }}
      />

      <details className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
        <summary className="cursor-pointer font-medium">{t("import.title")}</summary>
        <p className="mt-2">{t("import.hint")}</p>
        <code className="mt-2 block rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-950">/data/invoice-import</code>
      </details>

      {invoices.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={FileText} title={t("empty.title")} hint={t("empty.hint")} />
        </div>
      ) : (
        <InvoiceList
          invoices={invoices}
          locale={locale}
          labels={{
            unknownLocation: t("unknownLocation"),
            openPdf: t("openPdf"),
            energy: t("columns.energy"),
            amount: t("columns.amount"),
            session: t("columns.session"),
            matched: t("status.matched"),
            probable: t("status.probable"),
            unmatched: t("status.unmatched"),
            select: t("delete.select"),
            selected: t("delete.selected"),
            selectAll: t("delete.selectAll"),
            clearSelection: t("delete.clearSelection"),
            deleteOne: t("delete.one"),
            deleteSelected: t("delete.selectedButton"),
            confirmOne: t("delete.confirmOne"),
            confirmMany: t("delete.confirmMany"),
            deleting: t("delete.deleting"),
            deleteFailed: t("delete.failed"),
            deleted: t("delete.success"),
            costNote: t("delete.costWarning"),
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{value}</p></div>;
}
function formatAmount(amount: number | null, currency: string | null, locale: string): string {
  if (amount == null) return "–";
  const cur = currency ?? "EUR";
  try { return new Intl.NumberFormat(locale === "en" ? "en-GB" : "de-DE", { style: "currency", currency: cur }).format(amount); }
  catch { return `${amount.toFixed(2)} ${cur}`; }
}
function summarizeAmounts(invoices: TeslaInvoiceRecord[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const invoice of invoices) if (invoice.amount != null) totals.set(invoice.currency ?? "EUR", (totals.get(invoice.currency ?? "EUR") ?? 0) + invoice.amount);
  return totals;
}
function formatTotals(totals: Map<string, number>, locale: string): string {
  if (totals.size === 0) return "–";
  return [...totals].map(([currency, amount]) => formatAmount(amount, currency, locale)).join(" + ");
}
function formatEnergy(invoices: TeslaInvoiceRecord[]): string {
  const values = invoices.map((invoice) => invoice.energyKwh).filter((value): value is number => value != null);
  if (values.length === 0) return "–";
  return `${values.reduce((sum, value) => sum + value, 0).toFixed(1)} kWh`;
}
