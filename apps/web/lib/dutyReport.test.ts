import { describe, expect, it } from "vitest";
import {
  buildDutySummary,
  reimbursementForDistance,
} from "./dutyReport";

describe("duty report reimbursement", () => {
  it("calculates 0.30 EUR per business kilometre", () => {
    expect(reimbursementForDistance(123.4)).toBeCloseTo(37.02);
  });

  it("ignores non-business drives in the monthly summary", () => {
    const summary = buildDutySummary([
      { classification: "business", distanceKm: 100 },
      { classification: "private", distanceKm: 50 },
      { classification: "commute", distanceKm: 20 },
      { classification: "business", distanceKm: 25.5 },
    ]);

    expect(summary.driveCount).toBe(2);
    expect(summary.distanceKm).toBeCloseTo(125.5);
    expect(summary.reimbursementEur).toBeCloseTo(37.65);
    expect(summary.hasIncompleteDistance).toBe(false);
  });

  it("marks missing business distance as incomplete", () => {
    const summary = buildDutySummary([
      { classification: "business", distanceKm: null },
    ]);

    expect(summary.driveCount).toBe(1);
    expect(summary.distanceKm).toBe(0);
    expect(summary.reimbursementEur).toBe(0);
    expect(summary.hasIncompleteDistance).toBe(true);
  });
});
