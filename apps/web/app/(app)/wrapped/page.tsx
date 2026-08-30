import Link from "next/link";
import {
  BatteryCharging,
  Gauge,
  Map,
  MapPin,
  Route,
  Sparkles,
  Trophy,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClasses } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { VehicleRequiredState } from "../../../components/VehicleRequiredState";
import { todayInAppTz } from "../../../lib/day";
import { toIntlLocale } from "../../../lib/i18nLocale";
import { getVehicles } from "../../../lib/queries";
import { getAvailableYears, getWrappedData } from "../../../lib/yearAnalytics";
import { VisitHeatmapMapLoader } from "../places/heatmap/VisitHeatmapMapLoader";
import { WrappedPrintButton } from "./WrappedPrintButton";

export const dynamic = "force-dynamic";

function parseYear(raw: string | undefined, availableYears: number[]): number {
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isInteger(parsed) && availableYears.includes(parsed)) return parsed;
  const current = Number(todayInAppTz().slice(0, 4));
  return availableYears.includes(current) ? current : availableYears[0] ?? current;
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`break-inside-avoid rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
    >
      {children}
    </section>
  );
}

export default async function WrappedPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; vehicle?: string }>;
}) {
  const [t, tc, locale] = await Promise.all([
    getTranslations("wrapped"),
    getTranslations("common"),
    getLocale(),
  ]);
  const sp = await searchParams;
  const vehicles = await getVehicles();

  if (vehicles.length === 0) {
    return (
      <VehicleRequiredState
        title={t("title")}
        subtitle={t("subtitle")}
        className="mx-auto max-w-6xl"
      />
    );
  }

  const requestedVehicleId = sp.vehicle ? Number(sp.vehicle) : NaN;
  const vehicle =
    vehicles.find((candidate) => candidate.id === requestedVehicleId) ?? vehicles[0]!;
  const availableYears = await getAvailableYears(vehicle.id);
  const year = parseYear(sp.year, availableYears);
  const data = await getWrappedData(vehicle.id, year);

  const intlLocale = toIntlLocale(locale);
  const whole = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 });
  const oneDecimal = new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: 1,
  });
  const monthFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "short",
    timeZone: "UTC",
  });
  const monthLabels = Array.from({ length: 12 }, (_, index) =>
    monthFormatter.format(new Date(Date.UTC(year, index, 15))),
  );
  const maxMonthDistance = Math.max(...data.months.map((month) => month.distanceKm), 1);
  const totalClassDistance = Math.max(
    data.classifications.reduce((sum, item) => sum + item.distanceKm, 0),
    1,
  );

  function formatCost(currency: string | null, amount: number): string {
    if (!currency) return `${oneDecimal.format(amount)} ${t("charging.unknownCurrency")}`;
    try {
      return new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency,
      }).format(amount);
    } catch {
      return `${oneDecimal.format(amount)} ${currency}`;
    }
  }

  return (
    <div className="mx-auto max-w-6xl print:max-w-none">
      <header className="relative overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-cyan-50 p-6 sm:p-8 dark:border-violet-900/60 dark:from-violet-950/50 dark:via-neutral-950 dark:to-cyan-950/30">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">
                <Sparkles aria-hidden size={15} />
                {t("eyebrow")}
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                {t("heroTitle", { year })}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-300">
                {t("subtitle", { vehicle: vehicle.displayName })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Link
                href={`/places/heatmap?year=${year}&vehicle=${vehicle.id}`}
                className={buttonClasses("ghost", "sm")}
              >
                <Map aria-hidden size={15} />
                {t("openHeatmap")}
              </Link>
              <WrappedPrintButton label={t("print")} />
            </div>
          </div>

          <form className="mt-6 flex flex-wrap items-end gap-3 print:hidden">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("year")}
              </span>
              <select
                name="year"
                defaultValue={String(year)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              >
                {availableYears.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="vehicle" value={vehicle.id} />
            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              {t("showYear")}
            </button>
          </form>

          <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-white/70 p-4 backdrop-blur dark:bg-neutral-900/60">
              <dt className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <Route aria-hidden size={14} />
                {t("hero.distance")}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {whole.format(data.totalDistanceKm)} km
              </dd>
            </div>
            <div className="rounded-2xl bg-white/70 p-4 backdrop-blur dark:bg-neutral-900/60">
              <dt className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <Sparkles aria-hidden size={14} />
                {t("hero.drives")}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {whole.format(data.driveCount)}
              </dd>
            </div>
            <div className="rounded-2xl bg-white/70 p-4 backdrop-blur dark:bg-neutral-900/60">
              <dt className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <Gauge aria-hidden size={14} />
                {t("hero.consumption")}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {data.avgConsumptionWhKm == null
                  ? "–"
                  : `${whole.format(data.avgConsumptionWhKm)} Wh/km`}
              </dd>
            </div>
            <div className="rounded-2xl bg-white/70 p-4 backdrop-blur dark:bg-neutral-900/60">
              <dt className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <BatteryCharging aria-hidden size={14} />
                {t("hero.charged")}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {oneDecimal.format(data.charging.energyAddedKwh)} kWh
              </dd>
            </div>
          </dl>
        </div>
      </header>

      {data.driveCount === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Sparkles}
            title={t("empty.title")}
            hint={t("empty.hint", { year })}
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                <Trophy aria-hidden size={15} />
                {t("highlights.title")}
              </p>
              <dl className="mt-4 space-y-4">
                <div>
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("highlights.longestDrive")}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">
                    {data.longestDrive
                      ? `${oneDecimal.format(data.longestDrive.distanceKm)} km`
                      : "–"}
                  </dd>
                  {data.longestDrive && (
                    <dd className="truncate text-sm text-neutral-500 dark:text-neutral-400">
                      {data.longestDrive.destination}
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("highlights.favoriteDestination")}
                  </dt>
                  <dd className="mt-1 truncate text-lg font-semibold">
                    {data.favoriteDestination?.label ?? "–"}
                  </dd>
                  {data.favoriteDestination && (
                    <dd className="text-sm text-neutral-500 dark:text-neutral-400">
                      {t("highlights.visits", {
                        count: data.favoriteDestination.visits,
                      })}
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("highlights.farthest")}
                  </dt>
                  <dd className="mt-1 truncate text-lg font-semibold">
                    {data.farthestDestination?.label ?? "–"}
                  </dd>
                  {data.farthestDestination && (
                    <dd className="text-sm text-neutral-500 dark:text-neutral-400">
                      {t("highlights.fromHome", {
                        km: whole.format(data.farthestDestination.distanceFromHomeKm),
                      })}
                    </dd>
                  )}
                </div>
              </dl>
            </Card>

            <Card>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                {t("classification.title")}
              </p>
              <div className="mt-4 space-y-4">
                {data.classifications.map((bucket) => {
                  const share = (bucket.distanceKm / totalClassDistance) * 100;
                  return (
                    <div key={bucket.classification}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>{tc(`classification.${bucket.classification}`)}</span>
                        <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
                          {whole.format(bucket.distanceKm)} km
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <div
                          className="h-full rounded-full bg-violet-500"
                          style={{ width: `${Math.max(share, bucket.distanceKm > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                <BatteryCharging aria-hidden size={15} />
                {t("charging.title")}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("charging.sessions")}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">
                    {whole.format(data.charging.sessionCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("charging.dcSessions")}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">
                    {whole.format(data.charging.dcSessionCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("charging.maxDc")}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">
                    {data.charging.maxDcPowerKw == null
                      ? "–"
                      : `${whole.format(data.charging.maxDcPowerKw)} kW`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("charging.energy")}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">
                    {oneDecimal.format(data.charging.energyAddedKwh)} kWh
                  </dd>
                </div>
              </dl>
              {data.charging.favoriteChargingPlace && (
                <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("charging.favoritePlace")}
                  </p>
                  <p className="mt-1 truncate font-medium">
                    {data.charging.favoriteChargingPlace}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("charging.visits", {
                      count: data.charging.favoriteChargingPlaceVisits,
                    })}
                  </p>
                </div>
              )}
              {data.charging.costs.length > 0 && (
                <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("charging.costs")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {data.charging.costs.map((cost) => (
                      <span
                        key={cost.currency ?? "unknown"}
                        className="font-medium tabular-nums"
                      >
                        {formatCost(cost.currency, cost.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card className="mt-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                  {t("months.title")}
                </p>
                {data.busiestMonth && (
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    {t("months.busiest", {
                      month: monthLabels[data.busiestMonth.month - 1] ?? "",
                      km: whole.format(data.busiestMonth.distanceKm),
                    })}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-5 grid h-48 grid-cols-12 items-end gap-1.5 sm:gap-2">
              {data.months.map((month) => {
                const height = (month.distanceKm / maxMonthDistance) * 100;
                return (
                  <div key={month.month} className="flex h-full flex-col justify-end">
                    <div
                      className="min-h-[2px] rounded-t-md bg-violet-500/80"
                      style={{ height: `${height}%` }}
                      title={`${monthLabels[month.month - 1]}: ${whole.format(month.distanceKm)} km`}
                    />
                    <span className="mt-2 truncate text-center text-[10px] text-neutral-400 sm:text-xs">
                      {monthLabels[month.month - 1]}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                  <MapPin aria-hidden size={15} />
                  {t("map.title")}
                </p>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  {t("map.subtitle")}
                </p>
              </div>
              <Link
                href={`/places/heatmap?year=${year}&vehicle=${vehicle.id}`}
                className={`${buttonClasses("ghost", "sm")} print:hidden`}
              >
                {t("map.details")}
              </Link>
            </div>
            <div className="mt-4">
              {data.heatmap.length > 0 ? (
                <VisitHeatmapMapLoader
                  points={data.heatmap}
                  visitLabel={t("map.visitLabel")}
                />
              ) : (
                <EmptyState icon={Map} title={t("map.empty")} />
              )}
            </div>
          </Card>

          <footer className="mt-6 rounded-2xl bg-neutral-900 px-6 py-8 text-center text-white dark:bg-white dark:text-neutral-900">
            <Sparkles aria-hidden className="mx-auto" size={22} />
            <p className="mt-3 text-2xl font-semibold">
              {t("footer", { year, vehicle: vehicle.displayName })}
            </p>
          </footer>
        </>
      )}
    </div>
  );
}
