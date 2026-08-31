export interface ChargeAnalyticsPoint {
  ts: number;
  powerKw: number | null;
  soc: number | null;
  outsideTemp: number | null;
}

export interface ChargeAnalyticsSession {
  id: number;
  startTime: number;
  placeId: number | null;
  placeName: string | null;
  address: string | null;
  startSoc: number | null;
  endSoc: number | null;
  maxPowerKw: number | null;
  outsideTempAvg: number | null;
  duration1080Seconds: number | null;
  duration2060Seconds: number | null;
  points: ChargeAnalyticsPoint[];
}

export interface ChargingLocationRank {
  key: string;
  placeName: string | null;
  address: string | null;
  sessionCount: number;
  medianPeakKw: number | null;
  bestPeakKw: number | null;
  median1080Seconds: number | null;
}

export interface SlowChargeAlert {
  sessionId: number;
  startTime: number;
  placeName: string | null;
  address: string | null;
  outsideTempAvg: number | null;
  actualSeconds: number;
  comparisonMedianSeconds: number;
  slowerRatio: number;
  comparisonCount: number;
}

export interface ChargeAnalyticsResult {
  sessionCount: number;
  curveSessions: ChargeAnalyticsSession[];
  median1080Seconds: number | null;
  eligible1080Count: number;
  medianPeakKw: number | null;
  locations: ChargingLocationRank[];
  slowAlerts: SlowChargeAlert[];
}
