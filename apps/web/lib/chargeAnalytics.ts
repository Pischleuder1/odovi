import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
} from "drizzle-orm";
import {
  chargePoints,
  chargeSessions,
  places,
} from "@odovi/db";
import { db } from "./db";
import {
  buildLocationRanking,
  buildSlowAlerts,
  durationBetweenSoc,
  median,
} from "./chargeAnalyticsLogic";
import type {
  ChargeAnalyticsPoint,
  ChargeAnalyticsResult,
  ChargeAnalyticsSession,
} from "./chargeAnalyticsTypes";

export async function getChargingAnalytics(
  vehicleId: number,
  limit: 5 | 10,
): Promise<ChargeAnalyticsResult> {
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
    .leftJoin(
      places,
      eq(chargeSessions.placeId, places.id),
    )
    .where(
      and(
        eq(chargeSessions.vehicleId, vehicleId),
        eq(chargeSessions.chargerType, "dc"),
        isNotNull(chargeSessions.endTime),
      ),
    )
    .orderBy(desc(chargeSessions.startTime))
    .limit(limit);

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
    .orderBy(
      asc(chargePoints.chargeSessionId),
      asc(chargePoints.ts),
    );

  const pointsBySession =
    new Map<number, ChargeAnalyticsPoint[]>();

  for (const row of pointRows) {
    const list =
      pointsBySession.get(row.chargeSessionId) ?? [];

    list.push({
      ts: row.ts.getTime(),
      powerKw: row.powerKw,
      soc: row.soc,
      outsideTemp: row.outsideTemp,
    });

    pointsBySession.set(row.chargeSessionId, list);
  }

  const sessions: ChargeAnalyticsSession[] =
    sessionRows.map((row) => {
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
        duration1080Seconds: durationBetweenSoc(
          points,
          10,
          80,
        ),
        duration2060Seconds: durationBetweenSoc(
          points,
          20,
          60,
        ),
        points,
      };
    });

  const duration1080Values = sessions
    .map((session) => session.duration1080Seconds)
    .filter(
      (value): value is number =>
        value != null && value > 0,
    );

  const peakValues = sessions
    .map((session) => session.maxPowerKw)
    .filter(
      (value): value is number =>
        value != null && value > 0,
    );

  return {
    sessionCount: sessions.length,
    curveSessions: sessions.filter(
      (session) => session.points.length >= 3,
    ),
    median1080Seconds: median(duration1080Values),
    eligible1080Count: duration1080Values.length,
    medianPeakKw: median(peakValues),
    locations: buildLocationRanking(sessions),
    slowAlerts: buildSlowAlerts(sessions),
  };
}
