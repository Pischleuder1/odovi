import "server-only";

import { and, asc, desc, eq, gte, isNotNull, lt } from "drizzle-orm";
import {
  chargeSessions,
  drives,
  places,
} from "@odovi/db";
import { db } from "./db";
import { APP_TIMEZONE } from "./config";
import { dayBounds, todayInAppTz } from "./day";

export type DriveClassificationFilter =
  | "all"
  | "unclassified"
  | "private"
  | "business"
  | "commute";

export interface VisitHeatPoint {
  key: string;
  lat: number;
  lon: number;
  label: string;
  visits: number;
  knownPlace: boolean;
  placeType: string | null;
}

export interface VisitHeatmapData {
  year: number;
  classification: DriveClassificationFilter;
  totalVisits: number;
  uniqueLocations: number;
  points: VisitHeatPoint[];
}

export interface WrappedClassificationBucket {
  classification: Exclude<DriveClassificationFilter, "all">;
  distanceKm: number;
  driveCount: number;
}

export interface WrappedMonthBucket {
  month: number;
  distanceKm: number;
  driveCount: number;
}

export interface WrappedDriveHighlight {
  id: number;
  distanceKm: number;
  destination: string;
}

export interface WrappedDestinationHighlight {
  label: string;
  visits: number;
}

export interface WrappedFarthestHighlight {
  label: string;
  distanceFromHomeKm: number;
}

export interface WrappedChargeSummary {
  sessionCount: number;
  dcSessionCount: number;
  energyAddedKwh: number;
  maxDcPowerKw: number | null;
  favoriteChargingPlace: string | null;
  favoriteChargingPlaceVisits: number;
  costs: { currency: string | null; amount: number }[];
}

export interface WrappedData {
  year: number;
  driveCount: number;
  totalDistanceKm: number;
  totalEnergyKwh: number;
  avgConsumptionWhKm: number | null;
  classifications: WrappedClassificationBucket[];
  months: WrappedMonthBucket[];
  busiestMonth: WrappedMonthBucket | null;
  longestDrive: WrappedDriveHighlight | null;
  favoriteDestination: WrappedDestinationHighlight | null;
  farthestDestination: WrappedFarthestHighlight | null;
  charging: WrappedChargeSummary;
  heatmap: VisitHeatPoint[];
}

function yearInAppTz(date: Date): number {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: APP_TIMEZONE,
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "year")?.value ?? date.getUTCFullYear());
}

function monthInAppTz(date: Date): number {
  const parts = new Intl.DateTimeFormat("en", {
    month: "numeric",
    timeZone: APP_TIMEZONE,
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "month")?.value ?? date.getUTCMonth() + 1);
}

function rangeForYear(year: number): { start: Date; end: Date } {
  return {
    start: dayBounds(`${year}-01-01`).start,
    end: dayBounds(`${year + 1}-01-01`).start,
  };
}

export function parseClassificationFilter(
  raw: string | undefined,
): DriveClassificationFilter {
  if (
    raw === "unclassified" ||
    raw === "private" ||
    raw === "business" ||
    raw === "commute"
  ) {
    return raw;
  }
  return "all";
}

export async function getAvailableYears(vehicleId: number): Promise<number[]> {
  const [firstRows, lastRows] = await Promise.all([
    db
      .select({ startTime: drives.startTime })
      .from(drives)
      .where(eq(drives.vehicleId, vehicleId))
      .orderBy(asc(drives.startTime))
      .limit(1),
    db
      .select({ startTime: drives.startTime })
      .from(drives)
      .where(eq(drives.vehicleId, vehicleId))
      .orderBy(desc(drives.startTime))
      .limit(1),
  ]);

  const currentYear = Number(todayInAppTz().slice(0, 4));
  const minStart = firstRows[0]?.startTime ?? null;
  const maxStart = lastRows[0]?.startTime ?? null;
  if (!minStart || !maxStart) return [currentYear];

  const first = yearInAppTz(minStart);
  const last = Math.max(yearInAppTz(maxStart), currentYear);
  const years: number[] = [];
  for (let year = last; year >= first; year -= 1) years.push(year);
  return years;
}

function destinationKey(row: {
  endPlaceId: number | null;
  endLat: number | null;
  endLon: number | null;
}): string | null {
  if (row.endPlaceId != null) return `place:${row.endPlaceId}`;
  if (row.endLat == null || row.endLon == null) return null;
  return `coord:${row.endLat.toFixed(3)}:${row.endLon.toFixed(3)}`;
}

function destinationLabel(row: {
  placeName: string | null;
  endAddress: string | null;
  endLat: number | null;
  endLon: number | null;
}): string {
  if (row.placeName) return row.placeName;
  if (row.endAddress?.trim()) return row.endAddress.trim();
  if (row.endLat != null && row.endLon != null) {
    return `${row.endLat.toFixed(4)}, ${row.endLon.toFixed(4)}`;
  }
  return "—";
}

function aggregateVisitPoints(
  rows: {
    endPlaceId: number | null;
    endLat: number | null;
    endLon: number | null;
    endAddress: string | null;
    placeName: string | null;
    placeLat: number | null;
    placeLon: number | null;
    placeType: string | null;
  }[],
): VisitHeatPoint[] {
  const grouped = new Map<string, VisitHeatPoint>();

  for (const row of rows) {
    const key = destinationKey(row);
    if (!key) continue;

    const lat = row.endPlaceId != null ? row.placeLat ?? row.endLat : row.endLat;
    const lon = row.endPlaceId != null ? row.placeLon ?? row.endLon : row.endLon;
    if (lat == null || lon == null) continue;

    const existing = grouped.get(key);
    if (existing) {
      existing.visits += 1;
      continue;
    }

    grouped.set(key, {
      key,
      lat,
      lon,
      label: destinationLabel(row),
      visits: 1,
      knownPlace: row.endPlaceId != null,
      placeType: row.placeType,
    });
  }

  return [...grouped.values()].sort(
    (a, b) => b.visits - a.visits || a.label.localeCompare(b.label),
  );
}

export async function getVisitHeatmapData(
  vehicleId: number,
  year: number,
  classification: DriveClassificationFilter = "all",
): Promise<VisitHeatmapData> {
  const { start, end } = rangeForYear(year);
  const filters = [
    eq(drives.vehicleId, vehicleId),
    gte(drives.startTime, start),
    lt(drives.startTime, end),
    isNotNull(drives.endTime),
  ];
  if (classification !== "all") {
    filters.push(eq(drives.classification, classification));
  }

  const rows = await db
    .select({
      endPlaceId: drives.endPlaceId,
      endLat: drives.endLat,
      endLon: drives.endLon,
      endAddress: drives.endAddress,
      placeName: places.name,
      placeLat: places.lat,
      placeLon: places.lon,
      placeType: places.type,
    })
    .from(drives)
    .leftJoin(places, eq(drives.endPlaceId, places.id))
    .where(and(...filters));

  const points = aggregateVisitPoints(rows);
  return {
    year,
    classification,
    totalVisits: points.reduce((sum, point) => sum + point.visits, 0),
    uniqueLocations: points.length,
    points,
  };
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export async function getWrappedData(
  vehicleId: number,
  year: number,
): Promise<WrappedData> {
  const { start, end } = rangeForYear(year);

  const driveRows = await db
    .select({
      id: drives.id,
      startTime: drives.startTime,
      distanceKm: drives.distanceKm,
      consumedEnergyKwh: drives.consumedEnergyKwh,
      classification: drives.classification,
      endPlaceId: drives.endPlaceId,
      endLat: drives.endLat,
      endLon: drives.endLon,
      endAddress: drives.endAddress,
      placeName: places.name,
      placeLat: places.lat,
      placeLon: places.lon,
      placeType: places.type,
    })
    .from(drives)
    .leftJoin(places, eq(drives.endPlaceId, places.id))
    .where(
      and(
        eq(drives.vehicleId, vehicleId),
        gte(drives.startTime, start),
        lt(drives.startTime, end),
        isNotNull(drives.endTime),
      ),
    );

  const chargeRows = await db
    .select({
      startTime: chargeSessions.startTime,
      energyAddedKwh: chargeSessions.energyAddedKwh,
      maxPowerKw: chargeSessions.maxPowerKw,
      chargerType: chargeSessions.chargerType,
      cost: chargeSessions.cost,
      currency: chargeSessions.currency,
      placeName: places.name,
      address: chargeSessions.address,
      lat: chargeSessions.lat,
      lon: chargeSessions.lon,
    })
    .from(chargeSessions)
    .leftJoin(places, eq(chargeSessions.placeId, places.id))
    .where(
      and(
        eq(chargeSessions.vehicleId, vehicleId),
        gte(chargeSessions.startTime, start),
        lt(chargeSessions.startTime, end),
      ),
    );

  const totalDistanceKm = driveRows.reduce(
    (sum, row) => sum + (row.distanceKm ?? 0),
    0,
  );
  const totalEnergyKwh = driveRows.reduce(
    (sum, row) => sum + (row.consumedEnergyKwh ?? 0),
    0,
  );
  const avgConsumptionWhKm =
    totalDistanceKm > 0 && totalEnergyKwh > 0
      ? (totalEnergyKwh * 1000) / totalDistanceKm
      : null;

  const classificationOrder: WrappedClassificationBucket["classification"][] = [
    "business",
    "private",
    "commute",
    "unclassified",
  ];
  const classifications = classificationOrder.map((classification) => {
    const selected = driveRows.filter((row) => row.classification === classification);
    return {
      classification,
      distanceKm: selected.reduce((sum, row) => sum + (row.distanceKm ?? 0), 0),
      driveCount: selected.length,
    };
  });

  const months: WrappedMonthBucket[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    distanceKm: 0,
    driveCount: 0,
  }));
  for (const row of driveRows) {
    const bucket = months[monthInAppTz(row.startTime) - 1];
    if (!bucket) continue;
    bucket.distanceKm += row.distanceKm ?? 0;
    bucket.driveCount += 1;
  }
  const busiestMonth =
    months.reduce<WrappedMonthBucket | null>(
      (best, month) =>
        month.distanceKm > (best?.distanceKm ?? 0) ? month : best,
      null,
    ) ?? null;

  const longestRow = driveRows.reduce<(typeof driveRows)[number] | null>(
    (best, row) =>
      (row.distanceKm ?? 0) > (best?.distanceKm ?? 0) ? row : best,
    null,
  );
  const longestDrive =
    longestRow && (longestRow.distanceKm ?? 0) > 0
      ? {
          id: longestRow.id,
          distanceKm: longestRow.distanceKm ?? 0,
          destination: destinationLabel(longestRow),
        }
      : null;

  const heatmap = aggregateVisitPoints(driveRows);
  const favoritePoint =
    heatmap.find((point) => point.placeType !== "home") ?? heatmap[0] ?? null;
  const favoriteDestination = favoritePoint
    ? { label: favoritePoint.label, visits: favoritePoint.visits }
    : null;

  const homeRows = await db
    .select({ lat: places.lat, lon: places.lon })
    .from(places)
    .where(eq(places.type, "home"))
    .limit(1);
  const home = homeRows[0];

  let farthestDestination: WrappedFarthestHighlight | null = null;
  if (home) {
    for (const row of driveRows) {
      const lat = row.endPlaceId != null ? row.placeLat ?? row.endLat : row.endLat;
      const lon = row.endPlaceId != null ? row.placeLon ?? row.endLon : row.endLon;
      if (lat == null || lon == null) continue;
      const distanceFromHomeKm = haversineKm(home.lat, home.lon, lat, lon);
      if (
        !farthestDestination ||
        distanceFromHomeKm > farthestDestination.distanceFromHomeKm
      ) {
        farthestDestination = {
          label: destinationLabel(row),
          distanceFromHomeKm,
        };
      }
    }
  }

  const chargePlaceCounts = new Map<string, number>();
  const costByCurrency = new Map<string | null, number>();
  let maxDcPowerKw: number | null = null;
  let energyAddedKwh = 0;
  let dcSessionCount = 0;

  for (const charge of chargeRows) {
    energyAddedKwh += charge.energyAddedKwh ?? 0;
    if (charge.chargerType === "dc") {
      dcSessionCount += 1;
      if (charge.maxPowerKw != null) {
        maxDcPowerKw = Math.max(maxDcPowerKw ?? 0, charge.maxPowerKw);
      }
    }

    const chargeLabel =
      charge.placeName ??
      charge.address?.trim() ??
      (charge.lat != null && charge.lon != null
        ? `${charge.lat.toFixed(4)}, ${charge.lon.toFixed(4)}`
        : null);
    if (chargeLabel) {
      chargePlaceCounts.set(
        chargeLabel,
        (chargePlaceCounts.get(chargeLabel) ?? 0) + 1,
      );
    }

    if (charge.cost != null) {
      const amount = Number(charge.cost);
      if (Number.isFinite(amount)) {
        const currency = charge.currency ?? null;
        costByCurrency.set(currency, (costByCurrency.get(currency) ?? 0) + amount);
      }
    }
  }

  const favoriteCharging = [...chargePlaceCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];

  return {
    year,
    driveCount: driveRows.length,
    totalDistanceKm,
    totalEnergyKwh,
    avgConsumptionWhKm,
    classifications,
    months,
    busiestMonth,
    longestDrive,
    favoriteDestination,
    farthestDestination,
    charging: {
      sessionCount: chargeRows.length,
      dcSessionCount,
      energyAddedKwh,
      maxDcPowerKw,
      favoriteChargingPlace: favoriteCharging?.[0] ?? null,
      favoriteChargingPlaceVisits: favoriteCharging?.[1] ?? 0,
      costs: [...costByCurrency.entries()]
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => (a.currency ?? "").localeCompare(b.currency ?? "")),
    },
    heatmap,
  };
}
