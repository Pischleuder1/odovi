import { describe, expect, it } from "vitest";

import {
  buildLocationRanking,
  buildSlowAlerts,
  durationBetweenSoc,
  median,
  timeAtSoc,
} from "./chargeAnalyticsLogic";
import type {
  ChargeAnalyticsPoint,
  ChargeAnalyticsSession,
} from "./chargeAnalyticsTypes";

function point(
  seconds: number,
  soc: number,
  powerKw = 100,
): ChargeAnalyticsPoint {
  return {
    ts: seconds * 1000,
    soc,
    powerKw,
    outsideTemp: null,
  };
}

function session(
  id: number,
  overrides: Partial<ChargeAnalyticsSession> = {},
): ChargeAnalyticsSession {
  return {
    id,
    startTime: id * 1000,
    placeId: null,
    placeName: null,
    address: null,
    startSoc: null,
    endSoc: null,
    maxPowerKw: null,
    outsideTempAvg: null,
    duration1080Seconds: null,
    duration2060Seconds: null,
    points: [],
    ...overrides,
  };
}

describe("charge analytics", () => {
  it("calculates medians for odd and even sample counts", () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([40, 10, 30, 20])).toBe(25);
    expect(median([])).toBeNull();
  });

  it("interpolates the timestamp at a requested state of charge", () => {
    const points = [
      point(0, 5),
      point(100, 15),
    ];

    expect(timeAtSoc(points, 10)).toBe(50_000);
  });

  it("interpolates the 10 to 80 percent charging duration", () => {
    const points = [
      point(0, 5),
      point(100, 15),
      point(700, 75),
      point(800, 85),
    ];

    expect(durationBetweenSoc(points, 10, 80)).toBe(700);
  });

  it("returns null when the requested SoC window is not covered", () => {
    const points = [
      point(0, 20),
      point(300, 50),
      point(600, 70),
    ];

    expect(durationBetweenSoc(points, 10, 80)).toBeNull();
  });

  it("groups sessions by place and calculates location statistics", () => {
    const ranking = buildLocationRanking([
      session(1, {
        placeId: 10,
        placeName: "Alpha",
        maxPowerKw: 100,
        duration1080Seconds: 1800,
      }),
      session(2, {
        placeId: 10,
        placeName: "Alpha",
        maxPowerKw: 120,
        duration1080Seconds: 2100,
      }),
      session(3, {
        placeId: 20,
        placeName: "Beta",
        maxPowerKw: 150,
        duration1080Seconds: 1700,
      }),
    ]);

    expect(ranking).toHaveLength(2);

    expect(ranking[0]).toMatchObject({
      placeName: "Beta",
      sessionCount: 1,
      medianPeakKw: 150,
      bestPeakKw: 150,
      median1080Seconds: 1700,
    });

    expect(ranking[1]).toMatchObject({
      placeName: "Alpha",
      sessionCount: 2,
      medianPeakKw: 110,
      bestPeakKw: 120,
      median1080Seconds: 1950,
    });
  });

  it("does not flag slow charging without enough peers", () => {
    const alerts = buildSlowAlerts([
      session(1, { duration2060Seconds: 300 }),
      session(2, { duration2060Seconds: 300 }),
      session(3, { duration2060Seconds: 500 }),
    ]);

    expect(alerts).toEqual([]);
  });

  it("flags a materially slower session when enough peers exist", () => {
    const alerts = buildSlowAlerts([
      session(1, { duration2060Seconds: 300 }),
      session(2, { duration2060Seconds: 300 }),
      session(3, { duration2060Seconds: 300 }),
      session(4, { duration2060Seconds: 500 }),
    ]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      sessionId: 4,
      actualSeconds: 500,
      comparisonMedianSeconds: 300,
      comparisonCount: 3,
    });
  });

  it("uses temperature peers only when enough comparable sessions exist", () => {
    const alerts = buildSlowAlerts([
      session(1, {
        duration2060Seconds: 500,
        outsideTempAvg: 5,
      }),
      session(2, {
        duration2060Seconds: 300,
        outsideTempAvg: 4,
      }),
      session(3, {
        duration2060Seconds: 310,
        outsideTempAvg: 6,
      }),
      session(4, {
        duration2060Seconds: 290,
        outsideTempAvg: 8,
      }),
      session(5, {
        duration2060Seconds: 900,
        outsideTempAvg: 30,
      }),
    ]);

    const target = alerts.find(
      (alert) => alert.sessionId === 1,
    );

    expect(target).toBeDefined();
    expect(target?.comparisonCount).toBe(3);
    expect(target?.comparisonMedianSeconds).toBe(300);
  });
});
