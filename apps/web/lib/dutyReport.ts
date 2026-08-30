export const DUTY_RATE_EUR_PER_KM = 0.3;

export interface DutyDistanceRow {
  classification: string;
  distanceKm: number | null;
}

export interface DutySummary {
  driveCount: number;
  distanceKm: number;
  reimbursementEur: number;
  hasIncompleteDistance: boolean;
}

export function reimbursementForDistance(
  distanceKm: number | null,
  rateEurPerKm = DUTY_RATE_EUR_PER_KM,
): number | null {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return distanceKm * rateEurPerKm;
}

export function buildDutySummary(
  rows: DutyDistanceRow[],
  rateEurPerKm = DUTY_RATE_EUR_PER_KM,
): DutySummary {
  const business = rows.filter((row) => row.classification === "business");
  let distanceKm = 0;
  let hasIncompleteDistance = false;

  for (const row of business) {
    if (row.distanceKm == null || !Number.isFinite(row.distanceKm)) {
      hasIncompleteDistance = true;
      continue;
    }
    distanceKm += row.distanceKm;
  }

  return {
    driveCount: business.length,
    distanceKm,
    reimbursementEur: distanceKm * rateEurPerKm,
    hasIncompleteDistance,
  };
}
