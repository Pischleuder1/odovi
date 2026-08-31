"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, BatteryCharging, MapPin, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  ChargeAnalyticsPoint,
  ChargeAnalyticsResult,
  ChargeAnalyticsSession,
} from "../../../../lib/chargeAnalyticsTypes";
import { toIntlLocale } from "../../../../lib/i18nLocale";

interface Props {
  analytics: ChargeAnalyticsResult;
  locale: string;
  timeZone: string;
  limit: 5 | 10;
}

const SVG_WIDTH = 820;
const SVG_HEIGHT = 300;
const LEFT = 54;
const RIGHT = 18;
const TOP = 18;
const BOTTOM = 40;

function formatPower(value: number | null, locale: string): string {
  if (value == null) return "–";
  return `${new Intl.NumberFormat(toIntlLocale(locale), {
    maximumFractionDigits: 1,
  }).format(value)} kW`;
}

function formatDuration(seconds: number | null, locale: string): string {
  if (seconds == null) return "–";
  const minutes = seconds / 60;
  return `${new Intl.NumberFormat(toIntlLocale(locale), {
    maximumFractionDigits: minutes < 10 ? 1 : 0,
  }).format(minutes)} min`;
}

function formatDate(ts: number, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone,
  }).format(new Date(ts));
}

function formatTemp(value: number | null, locale: string): string {
  if (value == null) return "–";
  return `${new Intl.NumberFormat(toIntlLocale(locale), {
    maximumFractionDigits: 1,
  }).format(value)} °C`;
}

function locationLabel(
  session: Pick<ChargeAnalyticsSession, "placeName" | "address">,
  fallback: string,
): string {
  return session.placeName ?? session.address ?? fallback;
}

function pathForSession(session: ChargeAnalyticsSession, yMax: number): string {
  const innerWidth = SVG_WIDTH - LEFT - RIGHT;
  const innerHeight = SVG_HEIGHT - TOP - BOTTOM;
  const points = session.points.filter(
    (point): point is ChargeAnalyticsPoint & { soc: number; powerKw: number } =>
      point.soc != null &&
      point.powerKw != null &&
      point.soc >= 0 &&
      point.soc <= 100 &&
      point.powerKw >= 0,
  );
  return points
    .map((point, index) => {
      const x = LEFT + (point.soc / 100) * innerWidth;
      const y = TOP + (1 - Math.min(point.powerKw, yMax) / yMax) * innerHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function ChargeCurveChart({
  sessions,
  locale,
  timeZone,
  limit,
}: {
  sessions: ChargeAnalyticsSession[];
  locale: string;
  timeZone: string;
  limit: 5 | 10;
}) {
  const t = useTranslations("charges");
  const visible = sessions;
  const yMax = useMemo(() => {
    const max = Math.max(
      100,
      ...visible.flatMap((session) =>
        session.points
          .map((point) => point.powerKw)
          .filter((power): power is number => power != null && power >= 0),
      ),
    );
    return Math.ceil(max / 50) * 50;
  }, [visible]);

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {t("analysis.curves.noData")}
      </p>
    );
  }

  const innerWidth = SVG_WIDTH - LEFT - RIGHT;
  const innerHeight = SVG_HEIGHT - TOP - BOTTOM;
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = [0, 20, 40, 60, 80, 100];

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {t("analysis.curves.hint")}
        </p>
        <div className="flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700">
          {[5, 10].map((value) => (
            <Link
              key={value}
              href={`/charges/analysis?limit=${value}`}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                limit === value
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              {t("analysis.curves.last", { count: value })}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="min-w-[620px] text-neutral-400 dark:text-neutral-600"
          role="img"
          aria-label={t("analysis.curves.aria")}
        >
          {yTicks.map((fraction) => {
            const y = TOP + (1 - fraction) * innerHeight;
            const value = Math.round(fraction * yMax);
            return (
              <g key={fraction}>
                <line
                  x1={LEFT}
                  x2={LEFT + innerWidth}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.22"
                />
                <text
                  x={LEFT - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="currentColor"
                >
                  {value}
                </text>
              </g>
            );
          })}
          {xTicks.map((soc) => {
            const x = LEFT + (soc / 100) * innerWidth;
            return (
              <g key={soc}>
                <line
                  x1={x}
                  x2={x}
                  y1={TOP}
                  y2={TOP + innerHeight}
                  stroke="currentColor"
                  strokeOpacity="0.13"
                />
                <text
                  x={x}
                  y={SVG_HEIGHT - 14}
                  textAnchor="middle"
                  fontSize="11"
                  fill="currentColor"
                >
                  {soc}%
                </text>
              </g>
            );
          })}
          <text x="8" y="13" fontSize="11" fill="currentColor">
            kW
          </text>
          {visible.map((session, index) => (
            <path
              key={session.id}
              d={pathForSession(session, yMax)}
              fill="none"
              stroke={`hsl(${(index * 47 + 205) % 360} 68% 50%)`}
              strokeWidth={index === 0 ? 3 : 2}
              strokeOpacity={index === 0 ? 1 : 0.72}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {visible.map((session, index) => (
          <Link
            key={session.id}
            href={`/charges/${session.id}`}
            className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-xs transition hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: `hsl(${(index * 47 + 205) % 360} 68% 50%)` }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-neutral-900 dark:text-neutral-100">
                {formatDate(session.startTime, locale, timeZone)} · {locationLabel(session, t("analysis.unknownLocation"))}
              </span>
              <span className="text-neutral-500 dark:text-neutral-400">
                {formatPower(session.maxPowerKw, locale)} · {formatDuration(session.duration1080Seconds, locale)} · {formatTemp(session.outsideTempAvg, locale)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function ChargeAnalytics({ analytics, locale, timeZone, limit }: Props) {
  const t = useTranslations("charges");

  if (analytics.sessionCount === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 font-medium">
          <BatteryCharging aria-hidden size={18} />
          {t("analysis.noDcTitle")}
        </div>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {t("analysis.noDcHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {t("analysis.stats.median1080")}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatDuration(analytics.median1080Seconds, locale)}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
            {t("analysis.stats.eligible", { count: analytics.eligible1080Count })}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {t("analysis.stats.medianPeak")}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatPower(analytics.medianPeakKw, locale)}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
            {t("analysis.stats.recentScope")}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {t("analysis.stats.dcSessions")}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{analytics.sessionCount}</p>
          <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
            {t("analysis.stats.maxScope")}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex items-center gap-2">
          <Zap aria-hidden size={18} />
          <h2 className="font-semibold">{t("analysis.curves.title")}</h2>
        </div>
        <ChargeCurveChart
          sessions={analytics.curveSessions}
          locale={locale}
          timeZone={timeZone}
          limit={limit}
        />
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex items-center gap-2">
          <MapPin aria-hidden size={18} />
          <h2 className="font-semibold">{t("analysis.locations.title")}</h2>
        </div>
        {analytics.locations.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t("analysis.locations.noData")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-xs text-neutral-500 dark:text-neutral-400">
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="pb-2 pr-3 font-medium">{t("analysis.locations.location")}</th>
                  <th className="pb-2 px-3 text-right font-medium">{t("analysis.locations.sessions")}</th>
                  <th className="pb-2 px-3 text-right font-medium">{t("analysis.locations.medianPeak")}</th>
                  <th className="pb-2 px-3 text-right font-medium">{t("analysis.locations.bestPeak")}</th>
                  <th className="pb-2 pl-3 text-right font-medium">{t("analysis.locations.median1080")}</th>
                </tr>
              </thead>
              <tbody>
                {analytics.locations.map((location, index) => (
                  <tr key={location.key} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/70">
                    <td className="py-3 pr-3">
                      <span className="mr-2 text-neutral-400">{index + 1}.</span>
                      <span className="font-medium">
                        {location.placeName ?? location.address ?? t("analysis.unknownLocation")}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{location.sessionCount}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatPower(location.medianPeakKw, locale)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatPower(location.bestPeakKw, locale)}</td>
                    <td className="py-3 pl-3 text-right tabular-nums">{formatDuration(location.median1080Seconds, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle aria-hidden size={18} />
          <h2 className="font-semibold">{t("analysis.alerts.title")}</h2>
        </div>
        {analytics.slowAlerts.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t("analysis.alerts.none")}
          </p>
        ) : (
          <div className="space-y-2">
            {analytics.slowAlerts.map((alert) => (
              <Link
                key={alert.sessionId}
                href={`/charges/${alert.sessionId}`}
                className="block rounded-lg border border-amber-200 bg-amber-50/60 p-3 transition hover:border-amber-300 dark:border-amber-900/70 dark:bg-amber-950/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">
                      {formatDate(alert.startTime, locale, timeZone)} · {alert.placeName ?? alert.address ?? t("analysis.unknownLocation")}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                      {t("analysis.alerts.window", {
                        actual: formatDuration(alert.actualSeconds, locale),
                        median: formatDuration(alert.comparisonMedianSeconds, locale),
                      })}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-500">
                      {t("analysis.alerts.peers", { count: alert.comparisonCount })}
                      {alert.outsideTempAvg != null
                        ? ` · ${t("analysis.alerts.temperature", { value: formatTemp(alert.outsideTempAvg, locale) })}`
                        : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                    +{Math.round((alert.slowerRatio - 1) * 100)}%
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">
          {t("analysis.alerts.disclaimer")}
        </p>
      </section>
    </div>
  );
}
