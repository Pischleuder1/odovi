import Link from "next/link";
import { Download } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  buildMonthReport,
  formatKm,
  formatTime,
  type Classification,
} from "@odovi/core";
import { loadMonthReportData } from "../../../lib/exports/data";
import { isValidMonthParam } from "../../../lib/exports/params";
import { todayInAppTz } from "../../../lib/day";
import { buttonClasses } from "../../../components/ui/Button";
import { ReportFilters } from "./ReportFilters";
import { getVehicles } from "../../../lib/queries";
import { VehicleRequiredState } from "../../../components/VehicleRequiredState";
import {
  DUTY_RATE_EUR_PER_KM,
  buildDutySummary,
  reimbursementForDistance,
} from "../../../lib/dutyReport";

export const dynamic = "force-dynamic";

const ALL_CLASSIFICATIONS: Classification[] = [
  "unclassified",
  "private",
  "business",
  "commute",
];

/** Default filter: only "Geschäftlich" checked (vision.md §8.4 main use case). */
const DEFAULT_CLASSIFICATIONS: Classification[] = ["business"];

function currentMonthInAppTz(): string {
  return todayInAppTz().slice(0, 7);
}

function parseSelected(raw: string | undefined): Classification[] {
  if (raw == null || raw.trim() === "") return DEFAULT_CLASSIFICATIONS;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Classification =>
      ALL_CLASSIFICATIONS.includes(s as Classification),
    );
  return parts.length > 0 ? parts : DEFAULT_CLASSIFICATIONS;
}

function formatDateCell(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; classification?: string }>;
}) {
  const [t, tc, locale] = await Promise.all([
    getTranslations("reports"),
    getTranslations("common"),
    getLocale(),
  ]);
  const sp = await searchParams;
  const month = sp.month && isValidMonthParam(sp.month) ? sp.month : currentMonthInAppTz();
  const selected = parseSelected(sp.classification);

  const vehicles = await getVehicles();
  if (vehicles.length === 0) {
    return (
      <VehicleRequiredState
        title={t("title")}
        subtitle={t("subtitle")}
        className="mx-auto max-w-4xl"
      />
    );
  }

  const data = await loadMonthReportData(month, selected);
  const report = buildMonthReport(data.drives, month, data.meta, selected);
  const showDutyReport = selected.includes("business");
  const dutySummary = buildDutySummary(report.rows);
  const dutyAnnotations = new Map(
    data.drives.map((drive) => [
      drive.id,
      {
        customer: drive.customer?.trim() || null,
        purpose: drive.purpose?.trim() || null,
      },
    ]),
  );

  const euro = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const exportQuery = `?classification=${selected.join(",")}`;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {t("subtitle")}
      </p>

      <div className="mt-6">
        <ReportFilters month={month} selected={selected} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <a
          href={`/api/export/month/${month}${exportQuery}&format=csv`}
          className={buttonClasses("ghost", "sm")}
        >
          <Download aria-hidden size={14} />
          {t("exportCsv")}
        </a>
        <a
          href={`/api/export/month/${month}${exportQuery}&format=pdf`}
          className={buttonClasses("ghost", "sm")}
        >
          <Download aria-hidden size={14} />
          {t("exportPdf")}
        </a>
        {showDutyReport && (
          <>
            <a
              href={`/api/export/duty-month/${month}?format=csv`}
              className={buttonClasses("ghost", "sm")}
            >
              <Download aria-hidden size={14} />
              {t("duty.exportCsv")}
            </a>
            <a
              href={`/api/export/duty-month/${month}?format=pdf`}
              className={buttonClasses("ghost", "sm")}
            >
              <Download aria-hidden size={14} />
              {t("duty.exportPdf")}
            </a>
          </>
        )}
      </div>

      {showDutyReport && (
        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{t("duty.title")}</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {t("duty.rateHint", {
                  rate: euro.format(DUTY_RATE_EUR_PER_KM),
                })}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("duty.driveCount")}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {dutySummary.driveCount}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("duty.distance")}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatKm(dutySummary.distanceKm)}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("duty.reimbursement")}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {euro.format(dutySummary.reimbursementEur)}
              </p>
            </div>
          </div>

          {dutySummary.hasIncompleteDistance && (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              {t("duty.incomplete")}
            </p>
          )}
        </section>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {ALL_CLASSIFICATIONS.filter((c) => selected.includes(c)).map((c) => {
          const bucket = report.byClassification[c];
          return (
            <div
              key={c}
              className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {tc(`classification.${c}`)}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatKm(bucket.distanceKm)}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("driveCountLabel", { count: bucket.driveCount })}
              </p>
            </div>
          );
        })}
        <div className="rounded-xl border border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {t("total")}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatKm(report.totals.distanceKm)}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {t("driveCountLabel", { count: report.totals.driveCount })}
          </p>
        </div>
      </div>

      {report.hasIncompleteData && (
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          {t("incompleteDataHint")}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-3 py-2">{t("table.date")}</th>
              <th className="px-3 py-2">{t("table.time")}</th>
              <th className="px-3 py-2">{t("table.route")}</th>
              <th className="px-3 py-2">{t("table.customerPurpose")}</th>
              <th className="px-3 py-2 text-right">{t("table.km")}</th>
              <th className="px-3 py-2 text-right">{t("table.reimbursement")}</th>
              <th className="px-3 py-2">{t("table.classification")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {report.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-neutral-500 dark:text-neutral-400"
                >
                  {t("table.empty")}
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <tr key={row.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link
                      href={`/drives/${row.id}`}
                      className="hover:underline"
                    >
                      {formatDateCell(row.date)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {formatTime(row.startTime, row.meta.timeZone)}
                    {row.endTime ? ` – ${formatTime(row.endTime, row.meta.timeZone)}` : ""}
                  </td>
                  <td className="px-3 py-2">
                    {row.startPlace} <span className="text-neutral-400">→</span>{" "}
                    {row.endPlace}
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const annotation = dutyAnnotations.get(row.id);
                      const parts = [annotation?.customer, annotation?.purpose].filter(Boolean);
                      return parts.length > 0 ? parts.join(" · ") : "–";
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {row.distanceKm != null ? formatKm(row.distanceKm) : "–"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {row.classification === "business"
                      ? (() => {
                          const amount = reimbursementForDistance(row.distanceKm);
                          return amount != null ? euro.format(amount) : "–";
                        })()
                      : "–"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {tc(`classification.${row.classification}`)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
