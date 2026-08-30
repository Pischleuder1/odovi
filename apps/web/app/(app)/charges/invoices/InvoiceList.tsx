"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleHelp, FileText, Trash2 } from "lucide-react";
import { buttonClasses } from "../../../../components/ui/Button";
import { toIntlLocale } from "../../../../lib/i18nLocale";

type InvoiceMatchConfidence = "matched" | "probable" | "unmatched";

type InvoiceListItem = {
  id: string;
  sha256: string;
  sourceFile: string;
  importedAt: string;
  invoiceNumber: string | null;
  occurredAt: string | null;
  hasExactTime: boolean;
  amount: number | null;
  currency: string | null;
  energyKwh: number | null;
  location: string | null;
  match: {
    chargeSessionId: number | null;
    confidence: InvoiceMatchConfidence;
    score: number;
  };
};

type Labels = {
  unknownLocation: string;
  openPdf: string;
  energy: string;
  amount: string;
  session: string;
  matched: string;
  probable: string;
  unmatched: string;
  select: string;
  selected: string;
  selectAll: string;
  clearSelection: string;
  deleteOne: string;
  deleteSelected: string;
  confirmOne: string;
  confirmMany: string;
  deleting: string;
  deleteFailed: string;
  deleted: string;
  costNote: string;
};

export function InvoiceList({
  invoices,
  locale,
  labels,
}: {
  invoices: InvoiceListItem[];
  locale: string;
  labels: Labels;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const allSelected = invoices.length > 0 && selected.size === invoices.length;
  const selectedCount = selected.size;
  const selectedLabel = useMemo(() => labels.selected.replace("{count}", String(selectedCount)), [labels.selected, selectedCount]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(invoices.map((invoice) => invoice.id)));
  }

  async function deleteIds(ids: string[], confirmation: string) {
    if (ids.length === 0 || deleting) return;
    if (!window.confirm(confirmation)) return;

    setDeleting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/charge-invoices/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; deleted?: string[]; reconciliationErrors?: number[] }
        | null;
      if (!response.ok || !result?.ok) throw new Error("delete_failed");

      const deletedCount = result.deleted?.length ?? ids.length;
      const text = labels.deleted.replace("{count}", String(deletedCount));
      const warning = (result.reconciliationErrors?.length ?? 0) > 0 ? ` ${labels.costNote}` : "";
      setMessage({ type: "ok", text: `${text}${warning}` });
      setSelected(new Set());
      router.refresh();
    } catch {
      setMessage({ type: "error", text: labels.deleteFailed });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-neutral-300"
          />
          {labels.selectAll}
        </label>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">{selectedLabel}</span>
        {selectedCount > 0 && (
          <button type="button" onClick={() => setSelected(new Set())} className={buttonClasses("secondary", "sm")} disabled={deleting}>
            {labels.clearSelection}
          </button>
        )}
        <button
          type="button"
          onClick={() => deleteIds([...selected], labels.confirmMany.replace("{count}", String(selectedCount)))}
          disabled={selectedCount === 0 || deleting}
          className="ml-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
        >
          <Trash2 aria-hidden size={15} />
          {deleting ? labels.deleting : labels.deleteSelected}
        </button>
      </div>

      {message && (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {invoices.map((invoice) => (
          <div key={invoice.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex gap-3">
              <label className="mt-0.5 flex shrink-0 cursor-pointer items-start" title={labels.select}>
                <input
                  type="checkbox"
                  checked={selected.has(invoice.id)}
                  onChange={() => toggle(invoice.id)}
                  aria-label={labels.select}
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </label>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{formatDate(invoice, locale)}</p>
                    <p className="mt-0.5 truncate font-medium">{invoice.location ?? labels.unknownLocation}</p>
                    <p className="mt-1 text-xs text-neutral-400">{invoice.invoiceNumber ?? invoice.sourceFile}</p>
                  </div>
                  <MatchBadge invoice={invoice} labels={{ matched: labels.matched, probable: labels.probable, unmatched: labels.unmatched }} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <Metric label={labels.energy} value={invoice.energyKwh != null ? `${invoice.energyKwh.toFixed(2)} kWh` : "–"} />
                  <Metric label={labels.amount} value={formatAmount(invoice.amount, invoice.currency, locale)} />
                  <Metric label={labels.session} value={invoice.match.chargeSessionId != null ? `#${invoice.match.chargeSessionId}` : "–"} />
                  <Metric label="SHA-256" value={`${invoice.sha256.slice(0, 12)}…`} mono />
                </dl>

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <a href={`/api/charge-invoices/pdf?id=${invoice.id}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "sm")}>
                    <FileText aria-hidden size={15} /> {labels.openPdf}
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteIds([invoice.id], labels.confirmOne)}
                    disabled={deleting}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-neutral-900 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    <Trash2 aria-hidden size={15} /> {labels.deleteOne}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-neutral-500 dark:text-neutral-400">{label}</dt><dd className={`mt-0.5 font-medium text-neutral-900 dark:text-neutral-100 ${mono ? "font-mono" : "tabular-nums"}`}>{value}</dd></div>;
}

function MatchBadge({ invoice, labels }: { invoice: InvoiceListItem; labels: Record<InvoiceMatchConfidence, string> }) {
  const config = invoice.match.confidence === "matched"
    ? { Icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" }
    : invoice.match.confidence === "probable"
      ? { Icon: AlertTriangle, cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" }
      : { Icon: CircleHelp, cls: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.cls}`}><config.Icon aria-hidden size={14} />{labels[invoice.match.confidence]}</span>;
}

function formatDate(invoice: InvoiceListItem, locale: string): string {
  const value = invoice.occurredAt ?? invoice.importedAt;
  return new Intl.DateTimeFormat(toIntlLocale(locale), { dateStyle: "medium", timeStyle: invoice.hasExactTime ? "short" : undefined }).format(new Date(value));
}

function formatAmount(amount: number | null, currency: string | null, locale: string): string {
  if (amount == null) return "–";
  const cur = currency ?? "EUR";
  try {
    return new Intl.NumberFormat(toIntlLocale(locale), { style: "currency", currency: cur }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${cur}`;
  }
}
