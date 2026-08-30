import { Map, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "../../../../components/ui/Button";
import { VehicleRequiredState } from "../../../../components/VehicleRequiredState";
import { todayInAppTz } from "../../../../lib/day";
import { toIntlLocale } from "../../../../lib/i18nLocale";
import { getVehicles } from "../../../../lib/queries";
import {
  getAvailableYears,
  getVisitHeatmapData,
  parseClassificationFilter,
} from "../../../../lib/yearAnalytics";
import { VisitHeatmapMapLoader } from "./VisitHeatmapMapLoader";

export const dynamic = "force-dynamic";

function parseYear(raw: string | undefined, availableYears: number[]): number {
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isInteger(parsed) && availableYears.includes(parsed)) return parsed;
  const current = Number(todayInAppTz().slice(0, 4));
  return availableYears.includes(current) ? current : availableYears[0] ?? current;
}

export default async function VisitHeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; classification?: string; vehicle?: string }>;
}) {
  const [t, tc, locale] = await Promise.all([
    getTranslations("heatmap"),
    getTranslations("common"),
    getLocale(),
  ]);
  const sp = await searchParams;
  const vehicles = await getVehicles();

  if (vehicles.length === 0) {
    return (
      <div className="mx-auto max-w-5xl">
        <div>
          <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
            <Map aria-hidden size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">
              {t("eyebrow")}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            {t("subtitle")}
          </p>
        </div>

        <div className="mt-6">
          <VisitHeatmapMapLoader
            points={[]}
            visitLabel={t("map.visitLabel")}
            emptyLabel={t("map.emptyLabel")}
          />
        </div>

        <VehicleRequiredState className="mt-6" />
      </div>
    );
  }

  const requestedVehicleId = sp.vehicle ? Number(sp.vehicle) : NaN;
  const vehicle =
    vehicles.find((candidate) => candidate.id === requestedVehicleId) ?? vehicles[0]!;
  const availableYears = await getAvailableYears(vehicle.id);
  const year = parseYear(sp.year, availableYears);
  const classification = parseClassificationFilter(sp.classification);
  const data = await getVisitHeatmapData(vehicle.id, year, classification);

  const number = new Intl.NumberFormat(toIntlLocale(locale), {
    maximumFractionDigits: 0,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
            <Map aria-hidden size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">
              {t("eyebrow")}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            {t("subtitle")}
          </p>
        </div>
        <Button
          href={`/wrapped?year=${year}&vehicle=${vehicle.id}`}
          variant="ghost"
          icon={<Sparkles aria-hidden size={16} />}
        >
          {t("openWrapped")}
        </Button>
      </div>

      <form className="mt-6 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-3 dark:border-neutral-800 dark:bg-neutral-900">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {t("filters.year")}
          </span>
          <select
            name="year"
            defaultValue={String(year)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            {availableYears.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {t("filters.classification")}
          </span>
          <select
            name="classification"
            defaultValue={classification}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="all">{t("filters.all")}</option>
            <option value="business">{tc("classification.business")}</option>
            <option value="private">{tc("classification.private")}</option>
            <option value="commute">{tc("classification.commute")}</option>
            <option value="unclassified">{tc("classification.unclassified")}</option>
          </select>
        </label>

        <div className="flex items-end">
          <input type="hidden" name="vehicle" value={vehicle.id} />
          <button
            type="submit"
            className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {t("filters.apply")}
          </button>
        </div>
      </form>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <dt className="text-xs text-neutral-500 dark:text-neutral-400">
            {t("stats.visits")}
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {number.format(data.totalVisits)}
          </dd>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <dt className="text-xs text-neutral-500 dark:text-neutral-400">
            {t("stats.locations")}
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {number.format(data.uniqueLocations)}
          </dd>
        </div>
        <div className="col-span-2 rounded-xl border border-neutral-200 bg-white p-4 sm:col-span-1 dark:border-neutral-800 dark:bg-neutral-900">
          <dt className="text-xs text-neutral-500 dark:text-neutral-400">
            {t("stats.topPlace")}
          </dt>
          <dd className="mt-1 truncate text-base font-semibold">
            {data.points[0]?.label ?? "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        <VisitHeatmapMapLoader
          points={data.points}
          visitLabel={t("map.visitLabel")}
          emptyLabel={t("map.emptyLabel")}
        />
      </div>

      {data.points.length > 0 && (
        <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-base font-semibold">{t("top.title")}</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t("top.subtitle")}
          </p>
          <ol className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
            {data.points.slice(0, 10).map((point, index) => (
              <li key={point.key} className="flex items-center gap-3 py-3">
                <span className="w-7 shrink-0 text-sm font-semibold tabular-nums text-neutral-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {point.label}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
                  {t("top.visits", { count: point.visits })}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="mt-4 text-xs leading-5 text-neutral-400 dark:text-neutral-500">
        {t("methodHint")}
      </p>
    </div>
  );
}
