import { asc, desc, eq, isNull } from "drizzle-orm";
import type { ActiveProviderResolution } from "@odovi/core";
import { drives, routePoints, type Db } from "@odovi/db";
import { recordSyncRun } from "./state.js";

const SOURCE = "location_provider";
const ENTITY = "elevation";

// Open-Meteo erlaubt bis zu 100 Koordinaten pro Request.
const COORDS_PER_REQUEST = 100;
// Höflichkeitspause zwischen Requests, um die kostenlose API nicht zu fluten.
const PAUSE_MS = 300;
// Obergrenze pro Sync-Zyklus, damit ein Tick nicht Stunden dauert — neueste
// Fahrten zuerst, damit frische Fahrten sofort ihre Höhenprofile bekommen und
// nicht hinter dem ~150k-Punkte-Rückstau der historischen Tessie-Fahrten
// warten müssen; die Historie füllt sich danach sukzessive rückwärts auf.
const DEFAULT_MAX_POINTS_PER_CYCLE = 500;

export interface ElevationSyncResult {
  pointsFilled: number;
}

export interface PendingPoint {
  id: number;
  lat: number;
  lon: number;
}

/**
 * Füllt fehlende route_points.elevation_m über den aktivierten Provider
 * nach. Kein Watermark nötig (kein Zeitfenster) — Fortschritt ergibt sich
 * direkt daraus, dass elevation_m nach dem Füllen nicht mehr NULL ist,
 * spätere Zyklen holen also automatisch nur noch die verbleibenden Punkte
 * (idempotent). Failure-soft: schlägt die API fehl, wird der Fehler in
 * sync_state protokolliert und der nächste Tick versucht es erneut.
 */
// Nach einem 429 (Rate-Limit) pausiert die Elevation-Anreicherung, statt
// jede Minute erneut anzuklopfen. Eskalierend (15 min → ×4 bis 12 h), weil
// Provider auch Tageslimits kennen können. Dauerfeuer würde sonst weitere
// standortbezogene Funktionen am selben Anschluss beeinträchtigen.
const RATE_LIMIT_BACKOFF_START_MS = 15 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MAX_MS = 12 * 60 * 60 * 1000;
let backoffMs = RATE_LIMIT_BACKOFF_START_MS;
let backoffUntil = 0;

export async function syncElevations(
  db: Db,
  provider: ActiveProviderResolution | null,
  maxPointsPerCycle = DEFAULT_MAX_POINTS_PER_CYCLE,
): Promise<ElevationSyncResult> {
  if (!provider) return { pointsFilled: 0 };
  if (Date.now() < backoffUntil) {
    return { pointsFilled: 0 };
  }
  try {
    const pending = await loadPendingPoints(db, maxPointsPerCycle);

    let pointsFilled = 0;
    for (let i = 0; i < pending.length; i += COORDS_PER_REQUEST) {
      const chunk = pending.slice(i, i + COORDS_PER_REQUEST);
      const elevations = await fetchElevations(provider, chunk);

      for (let j = 0; j < chunk.length; j++) {
        const elevationM = elevations[j];
        if (elevationM == null) continue;
        await db
          .update(routePoints)
          .set({ elevationM })
          .where(eq(routePoints.id, chunk[j]!.id));
        pointsFilled++;
      }

      if (i + COORDS_PER_REQUEST < pending.length) {
        await sleep(PAUSE_MS);
      }
    }

    backoffMs = RATE_LIMIT_BACKOFF_START_MS;
    await recordSyncRun(db, SOURCE, ENTITY, {
      status: "ok",
      rowsUpserted: pointsFilled,
    });
    return { pointsFilled };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("HTTP 429")) {
      backoffUntil = Date.now() + backoffMs;
      const retryMinutes = Math.round(backoffMs / 60000);
      console.warn(
        `[sync:elevation] ${provider.provider} rate limit — pausing for ${retryMinutes} min`,
      );
      backoffMs = Math.min(backoffMs * 4, RATE_LIMIT_BACKOFF_MAX_MS);
      await recordSyncRun(db, SOURCE, ENTITY, {
        status: "deferred",
        error: `${provider.provider} elevation rate-limited; retrying in about ${retryMinutes} min`,
        rowsUpserted: 0,
      });
      return { pointsFilled: 0 };
    }
    await recordSyncRun(db, SOURCE, ENTITY, {
      status: "error",
      error: message,
      rowsUpserted: 0,
    });
    // Failure-soft: Sync-Zyklus soll trotzdem weiterlaufen (kein throw).
    return { pointsFilled: 0 };
  }
}

/**
 * Lädt Route-Punkte ohne Höhenwert, neueste Fahrten zuerst (join über
 * drives.start_time DESC), begrenzt auf maxPointsPerCycle pro Zyklus.
 */
async function loadPendingPoints(
  db: Db,
  maxPointsPerCycle: number,
): Promise<PendingPoint[]> {
  const rows = await db
    .select({
      id: routePoints.id,
      lat: routePoints.lat,
      lon: routePoints.lon,
    })
    .from(routePoints)
    .innerJoin(drives, eq(routePoints.driveId, drives.id))
    .where(isNull(routePoints.elevationM))
    .orderBy(desc(drives.startTime), asc(routePoints.ts))
    .limit(maxPointsPerCycle);
  return rows;
}

type FetchLike = typeof fetch;

/** GET .../elevation?latitude=lat1,lat2,...&longitude=lon1,lon2,... */
export async function fetchElevations(
  provider: ActiveProviderResolution,
  points: PendingPoint[],
  fetcher: FetchLike = fetch,
): Promise<(number | null)[]> {
  const endpoint = provider.endpoints.elevation ?? provider.endpoints.default;
  if (!endpoint) throw new Error(`${provider.provider} has no elevation endpoint`);
  const url = new URL(endpoint);
  url.searchParams.set("latitude", points.map((p) => p.lat).join(","));
  url.searchParams.set("longitude", points.map((p) => p.lon).join(","));

  const headers = new Headers();
  if (provider.credentialHeader && provider.credential) {
    headers.set(provider.credentialHeader, provider.credential);
  }
  const res = await fetcher(url, { headers });
  if (!res.ok) {
    throw new Error(`${provider.provider} elevation: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { elevation?: number[] };
  if (!Array.isArray(body.elevation)) {
    throw new Error(`${provider.provider} elevation returned no elevation array`);
  }
  return body.elevation;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
