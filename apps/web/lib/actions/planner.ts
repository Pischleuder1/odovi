"use server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import {
  buildRoadtripLegs,
  downsample,
  summarizeElevation,
  type RoadtripPlanSnapshot,
} from "@odovi/core";
import { validateSession } from "../auth/session";
import { getLocationProviderPolicy } from "../locationProviders/policy";
import {
  requestRoadtripRoute,
  requestRouteElevations,
  type RoutingAdapterResult,
} from "../locationProviders/roadtrip";
import { resolveBaseConsumption, resolveChargingProfile } from "../planner";

/**
 * Server Action des Routenplaner-MVP („Reichweiten-Check"). Orchestriert
 * server-seitig (nie im Browser): aktiviertes Routing → optional aktiviertes
 * Höhenprofil → reines Verbrauchsmodell (@odovi/core) → Ankunfts-SoC. Beide
 * externen Fähigkeiten werden unabhängig durch LocationProviderPolicy
 * freigegeben; das Höhenprofil bleibt failure-soft.
 */

// Open-Meteo erlaubt bis zu 100 Koordinaten je Elevation-Request → Route auf
// höchstens so viele Stützpunkte downsampeln (ein Batch-Request).
const ELEVATION_MAX_POINTS = 100;
// Karten-Polyline: server-seitig ausdünnen, damit der Client-Payload/DOM leicht
// bleibt (lange Routen haben leicht mehrere tausend OSRM-Koordinaten).
const MAP_MAX_POINTS = 400;

const roadtripStopSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(500),
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
  kind: z.enum(["start", "waypoint", "charge", "destination"]),
  targetSoc: z.number().min(0).max(100).nullable().optional(),
});

const planRoadtripInputSchema = z.object({
  vehicleId: z.number().int().positive(),
  departureAt: z.string().datetime(),
  stops: z.array(roadtripStopSchema).min(2).max(12),
  startSoc: z.number().min(0).max(100),
  reserveSoc: z.number().min(0).max(50),
  tempC: z.number().min(-40).max(55),
  capacityKwh: z.number().min(5).max(250),
}).superRefine((value, ctx) => {
  if (value.stops[0]?.kind !== "start") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stops", 0, "kind"],
      message: "First stop must be the start",
    });
  }
  if (value.stops.at(-1)?.kind !== "destination") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stops", value.stops.length - 1, "kind"],
      message: "Last stop must be the destination",
    });
  }
});

export type PlanRoadtripInput = z.infer<typeof planRoadtripInputSchema>;
export type PlanResult = RoadtripPlanSnapshot;

export type PlanRouteResponse =
  | { ok: true; plan: PlanResult }
  | { ok: false; error: string };

/**
 * Plant eine Route und prognostiziert Verbrauch + Ankunfts-SoC. Reihenfolge:
 * aktiviertes Routing holen → separat aktiviertes Höhenprofil batchen →
 * Basisverbrauch aus Historie → core-Modell → SoC-Rechnung.
 */
export async function planRoadtrip(
  input: PlanRoadtripInput,
): Promise<PlanRouteResponse> {
  const t = await getTranslations("planner");
  const user = await validateSession();
  if (!user) return { ok: false, error: t("errors.notAuthenticated") };

  const parsed = planRoadtripInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidInput"),
    };
  }
  const {
    vehicleId,
    departureAt,
    stops,
    startSoc,
    reserveSoc,
    tempC,
    capacityKwh,
  } = parsed.data;

  const providerPolicy = await getLocationProviderPolicy();

  // 1) Routing bleibt ohne explizite Aktivierung vollständig lokal/ausgeschaltet.
  const routeRequest = await requestRoadtripRoute(providerPolicy, stops);
  if (routeRequest.status === "disabled") {
    return {
      ok: false,
      error: routeRequest.resolution.requiresReview
        ? t("errors.routingNeedsReview")
        : t("errors.routingDisabled"),
    };
  }
  if (routeRequest.value.status !== "ok") {
    return { ok: false, error: routingError(routeRequest.value, t) };
  }
  const route = routeRequest.value.route;

  // 2) Höhenprofil hat eine eigene Aktivierung und bleibt optional/failure-soft.
  const elevationSample = downsample(
    route.coordinates,
    Math.min(ELEVATION_MAX_POINTS, route.coordinates.length),
  );
  const elevationRequest = await requestRouteElevations(
    providerPolicy,
    elevationSample,
  );
  const elevations =
    elevationRequest.status === "ok" && elevationRequest.value.status === "ok"
      ? elevationRequest.value.elevations
      : null;
  const elevationOk = elevations != null;
  const { ascentM, descentM } = elevationOk
    ? summarizeElevation(elevations)
    : { ascentM: 0, descentM: 0 };

  // 3) Persönliche Fahr- und Schnellladeprofile aus der Historie.
  const [base, chargingProfile] = await Promise.all([
    resolveBaseConsumption(vehicleId, tempC),
    resolveChargingProfile(vehicleId),
  ]);

  // 4) Deterministische Verbrauchs- und SoC-Prognose je OSRM-Etappe.
  const prediction = buildRoadtripLegs({
    stops,
    routeLegs: route.legs.map((leg) => ({
      distanceKm: leg.distanceM / 1000,
      durationSeconds: leg.durationS,
    })),
    startSoc,
    capacityKwh,
    tempC,
    baseWhPerKm: base.baseWhPerKm,
    referenceSpeedKmh: base.referenceSpeedKmh,
    totalAscentM: ascentM,
    totalDescentM: descentM,
    chargeModel: chargingProfile.model,
  });

  // Karten-Geometrie ausdünnen und auf [lat, lon] drehen.
  const geometry: [number, number][] = downsample(
    route.coordinates,
    Math.min(MAP_MAX_POINTS, route.coordinates.length),
  ).map(([lon, lat]) => [lat, lon]);

  return {
    ok: true,
    plan: {
      schemaVersion: 1,
      vehicleId,
      departureAt,
      startSoc,
      reserveSoc,
      tempC,
      capacityKwh,
      stops,
      legs: prediction.legs,
      totals: prediction.totals,
      charging: prediction.charging,
      geometry,
      assumptions: {
        baseWhPerKm: base.baseWhPerKm,
        baseSource: base.source,
        referenceSpeedKmh: base.referenceSpeedKmh,
        tempBinCenterC: base.tempBinCenterC,
        historyDriveCount: base.historyDriveCount,
        elevationOk,
        ascentM,
        descentM,
        elevationAllocation: "distance-proportional",
        routeProvider: "osrm",
        routeProviderIsDefault: routeRequest.resolution.mode === "public",
        charging: {
          source: chargingProfile.source,
          sessionCount: chargingProfile.sessionCount,
          fallbackPowerKw: chargingProfile.model.fallbackPowerKw,
          bins: chargingProfile.model.bins,
        },
      },
    },
  };
}

function routingError(
  result: Exclude<RoutingAdapterResult, { status: "ok" }>,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  switch (result.status) {
    case "unreachable":
      return t("errors.routingUnreachable");
    case "rate-limited":
      return t("errors.routingRateLimited");
    case "http-error":
      return t("errors.routingHttpError", { status: result.httpStatus ?? 0 });
    case "bad-response":
      return t("errors.routingBadResponse");
    case "no-route":
      return t("errors.routingNoRoute");
  }
}
