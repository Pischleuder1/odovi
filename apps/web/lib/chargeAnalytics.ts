import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { chargePoints, chargeSessions, places } from "@odovi/db";
import { db } from "./db";
import type {
  ChargeAnalyticsPoint,
  ChargeAnalyticsResult,
  ChargeAnalyticsSession,
  ChargingLocationRank,
  SlowChargeAlert,
} from "./chargeAnalyticsTypes";

const ANALYTICS_SESSION_LIMIT = 50;
const CURVE_SESSION_LIMIT = 10;
const SLOW_THRESHOLD = 1.25;
const MIN_SLOW_SECONDS = 120;
const TEMP_PEER_WINDOW_C = 10;
const MIN_COMPARISON_COUNT = 3;

function median(values: number[]): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const mid = Math.floor(finite.length / 2);
  if (finite.length % 2 === 1) return finite[mid]!;
  return (finite[mid - 1]! + finite[mid]!) / 2;
}

function timeAtSoc(points: ChargeAnalyticsPoint[], targetSoc: number): number | null {
  const usable = points
    .filter(
      (point): point is ChargeAnalyticsPoint & { soc: number } =>
        point.soc != null && Number.isFinite(point.soc) && Number.isFinite(point.ts),
    )
    .sort((a, b) => a.ts - b.ts);

  if (usable.length === 0) return null;

  for (let i = 0; i < usable.length; i += 1) {
    const current = usable[i]!;
    if (current.soc === targetSoc) return current.ts;
    const next = usable[i + 1];
    if (!next) continue;

    const low = Math.min(current.soc, next.soc);
    const high = Math.max(current.soc, next.soc);
    if (targetSoc < low || targetSoc > high || current.soc === next.soc) continue;

    const fraction = (targetSoc - current.soc) / (next.soc - current.soc);
    return current.ts + (next.ts - current.ts) * fraction;
  }

  return null;
}

function durationBetweenSoc(
  points: ChargeAnalyticsPoint[],
  startSoc: number,
  endSoc: number,
): number | null {
  const start = timeAtSoc(points, startSoc);
  const end = timeAtSoc(points, endSoc);
  if (start == null || end == null || end <= start) return null;
  return Math.round((end - start) / 1000);
}

function locationKey(session: ChargeAnalyticsSession): string {
  if (session.placeId != null) return `place:${session.placeId}`;
  if (session.placeName) return `name:${session.placeName.trim().toLowerCase()}`;
  if (session.address) return `address:${session.address.trim().toLowerCase()}`;
  return "unknown";
}

function buildLocationRanking(sessions: ChargeAnalyticsSession[]): ChargingLocationRank[] {
  const groups = new Map<string, ChargeAnalyticsSession[]>();

  for (const session of sessions) {
    const key = locationKey(session);
    const list = groups.get(key) ?? [];
    list.push(session);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const peaks = group
        .map((session) => session.maxPowerKw)
        .filter((value): value is number => value != null && value > 0);
      const durations = group
        .map((session) => session.duration1080Seconds)
        .filter((value): value is number => value != null && value > 0);
      return {
        key,
        placeName: group[0]?.placeName ?? null,
        address: group[0]?.address ?? null,
        sessionCount: group.length,
        medianPeakKw: median(peaks),
        bestPeakKw: peaks.length > 0 ? Math.max(...peaks) : null,
        median1080Seconds: median(durations),
      };
    })
    .sort((a, b) => {
      const aPeak = a.medianPeakKw ?? -1;
      const bPeak = b.medianPeakKw ?? -1;
      if (bPeak !== aPeak) return bPeak - aPeak;
      return b.sessionCount - a.sessionCount;
    })
    .slice(0, 8);
}

function buildSlowAlerts(sessions: ChargeAnalyticsSession[]): SlowChargeAlert[] {
  const eligible = sessions.filter(
    (session): session is ChargeAnalyticsSession & { duration2060Seconds: number } =>
      session.duration2060Seconds != null && session.duration2060Seconds > 0,
  );

  const alerts: SlowChargeAlert[] = [];

  for (const session of eligible) {
    const allPeers = eligible.filter((peer) => peer.id !== session.id);
    let peers = allPeers;

    if (session.outsideTempAvg != null) {
      const tempPeers = allPeers.filter(
        (peer) =>
          peer.outsideTempAvg != null &&
          Math.abs(peer.outsideTempAvg - session.outsideTempAvg!) <= TEMP_PEER_WINDOW_C,
      );
      if (tempPeers.length >= MIN_COMPARISON_COUNT) peers = tempPeers;
    }

    if (peers.length < MIN_COMPARISON_COUNT) continue;
    const comparisonMedian = median(peers.map((peer) => peer.duration2060Seconds));
    if (comparisonMedian == null || comparisonMedian <= 0) continue;

    const slowerRatio = session.duration2060Seconds / comparisonMedian;
    if (
      slowerRatio >= SLOW_THRESHOLD &&
      session.duration2060Seconds - comparisonMedian >= MIN_SLOW_SECONDS
    ) {
      alerts.push({
        sessionId: session.id,
        startTime: session.startTime,
        placeName: session.placeName,
        address: session.address,
        outsideTempAvg: session.outsideTempAvg,
        actualSeconds: session.duration2060Seconds,
        comparisonMedianSeconds: Math.round(comparisonMedian),
        slowerRatio,
        comparisonCount: peers.length,
      });
    }
  }

  return alerts.sort((a, b) => b.slowerRatio - a.slowerRatio).slice(0, 5);
}

export async function getChargingAnalytics(vehicleId: number): Promise<ChargeAnalyticsResult> {
  const sessionRows = await db
    .select({
      id: chargeSessions.id,
      startTime: chargeSessions.startTime,
      placeId: chargeSessions.placeId,
      placeName: places.name,
      address: chargeSessions.address,
      startSoc: chargeSessions.startSoc,
      endSoc: chargeSessions.endSoc,
      maxPowerKw: chargeSessions.maxPowerKw,
      outsideTempAvg: chargeSessions.outsideTempAvg,
    })
    .from(chargeSessions)
    .leftJoin(places, eq(chargeSessions.placeId, places.id))
    .where(
      and(
        eq(chargeSessions.vehicleId, vehicleId),
        eq(chargeSessions.chargerType, "dc"),
      ),
    )
    .orderBy(desc(chargeSessions.startTime))
    .limit(ANALYTICS_SESSION_LIMIT);

  if (sessionRows.length === 0) {
    return {
      sessionCount: 0,
      curveSessions: [],
      median1080Seconds: null,
      eligible1080Count: 0,
      medianPeakKw: null,
      locations: [],
      slowAlerts: [],
    };
  }

  const ids = sessionRows.map((session) => session.id);
  const pointRows = await db
    .select({
      chargeSessionId: chargePoints.chargeSessionId,
      ts: chargePoints.ts,
      powerKw: chargePoints.powerKw,
      soc: chargePoints.soc,
      outsideTemp: chargePoints.outsideTemp,
    })
    .from(chargePoints)
    .where(inArray(chargePoints.chargeSessionId, ids))
    .orderBy(asc(chargePoints.chargeSessionId), asc(chargePoints.ts));

  const pointsBySession = new Map<number, ChargeAnalyticsPoint[]>();
  for (const row of pointRows) {
    const list = pointsBySession.get(row.chargeSessionId) ?? [];
    list.push({
      ts: row.ts.getTime(),
      powerKw: row.powerKw,
      soc: row.soc,
      outsideTemp: row.outsideTemp,
    });
    pointsBySession.set(row.chargeSessionId, list);
  }

  const sessions: ChargeAnalyticsSession[] = sessionRows.map((row) => {
    const points = pointsBySession.get(row.id) ?? [];
    return {
      id: row.id,
      startTime: row.startTime.getTime(),
      placeId: row.placeId,
      placeName: row.placeName,
      address: row.address,
      startSoc: row.startSoc,
      endSoc: row.endSoc,
      maxPowerKw: row.maxPowerKw,
      outsideTempAvg: row.outsideTempAvg,
      duration1080Seconds: durationBetweenSoc(points, 10, 80),
      duration2060Seconds: durationBetweenSoc(points, 20, 60),
      points,
    };
  });

  const duration1080Values = sessions
    .map((session) => session.duration1080Seconds)
    .filter((value): value is number => value != null && value > 0);
  const peakValues = sessions
    .map((session) => session.maxPowerKw)
    .filter((value): value is number => value != null && value > 0);

  return {
    sessionCount: sessions.length,
    curveSessions: sessions
      .filter((session) => session.points.length >= 3)
      .slice(0, CURVE_SESSION_LIMIT),
    median1080Seconds: median(duration1080Values),
    eligible1080Count: duration1080Values.length,
    medianPeakKw: median(peakValues),
    locations: buildLocationRanking(sessions),
    slowAlerts: buildSlowAlerts(sessions),
  };
}
