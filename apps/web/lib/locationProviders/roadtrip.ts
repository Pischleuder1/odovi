import {
  PUBLIC_LOCATION_PROVIDERS,
  type ActiveProviderResolution,
  type LocationProviderAdapter,
  type LocationProviderPolicy,
  type ProviderRequestResult,
  type RoadtripStop,
} from "@odovi/core";

export interface RoadtripRoute {
  distanceM: number;
  durationS: number;
  legs: Array<{ distanceM: number; durationS: number }>;
  /** OSRM returns GeoJSON coordinates as [longitude, latitude]. */
  coordinates: [number, number][];
}

export type RoutingAdapterResult =
  | { status: "ok"; route: RoadtripRoute }
  | {
      status:
        | "unreachable"
        | "rate-limited"
        | "http-error"
        | "bad-response"
        | "no-route";
      httpStatus?: number;
    };

export type ElevationAdapterResult =
  | { status: "ok"; elevations: number[] }
  | { status: "unavailable" };

export type RoutingProviderRequest = ProviderRequestResult<RoutingAdapterResult>;
export type ElevationProviderRequest = ProviderRequestResult<ElevationAdapterResult>;

type FetchImplementation = (
  input: URL | RequestInfo,
  init?: RequestInit,
) => Promise<Response>;

const OSRM_TIMEOUT_MS = 15_000;
const ELEVATION_TIMEOUT_MS = 10_000;

interface OsrmResponseShape {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: unknown };
    legs?: Array<{ distance?: number; duration?: number }>;
  }>;
}

function endpoint(
  provider: ActiveProviderResolution,
  publicKey: string,
): string {
  const value =
    provider.mode === "public"
      ? provider.endpoints[publicKey]
      : provider.endpoints.default;
  if (!value) {
    throw new Error(`Active ${provider.capability} provider has no endpoint`);
  }
  return value;
}

function requestHeaders(provider: ActiveProviderResolution): HeadersInit {
  return provider.credentialHeader && provider.credential
    ? { [provider.credentialHeader]: provider.credential }
    : {};
}

/** Validate the untrusted OSRM response before planner code can consume it. */
export function parseOsrmBody(
  body: unknown,
  expectedLegs: number,
): RoadtripRoute | null {
  if (typeof body !== "object" || body === null) return null;
  const candidate = body as OsrmResponseShape;
  if (candidate.code !== "Ok") return null;
  const route = candidate.routes?.[0];
  if (
    !route ||
    typeof route.distance !== "number" ||
    !Number.isFinite(route.distance) ||
    route.distance < 0 ||
    typeof route.duration !== "number" ||
    !Number.isFinite(route.duration) ||
    route.duration < 0 ||
    !Array.isArray(route.geometry?.coordinates) ||
    !Array.isArray(route.legs) ||
    route.legs.length !== expectedLegs
  ) {
    return null;
  }

  const coordinates: [number, number][] = [];
  for (const coordinate of route.geometry.coordinates as unknown[]) {
    if (
      Array.isArray(coordinate) &&
      typeof coordinate[0] === "number" &&
      Number.isFinite(coordinate[0]) &&
      coordinate[0] >= -180 &&
      coordinate[0] <= 180 &&
      typeof coordinate[1] === "number" &&
      Number.isFinite(coordinate[1]) &&
      coordinate[1] >= -90 &&
      coordinate[1] <= 90
    ) {
      coordinates.push([coordinate[0], coordinate[1]]);
    }
  }
  if (coordinates.length < 2) return null;

  const legs: Array<{ distanceM: number; durationS: number }> = [];
  for (const leg of route.legs) {
    if (
      typeof leg.distance !== "number" ||
      !Number.isFinite(leg.distance) ||
      leg.distance < 0 ||
      typeof leg.duration !== "number" ||
      !Number.isFinite(leg.duration) ||
      leg.duration < 0
    ) {
      return null;
    }
    legs.push({ distanceM: leg.distance, durationS: leg.duration });
  }

  return {
    distanceM: route.distance,
    durationS: route.duration,
    legs,
    coordinates,
  };
}

function routingAdapter(
  providerName: string,
  fetchImplementation: FetchImplementation,
): LocationProviderAdapter<readonly RoadtripStop[], RoutingAdapterResult> {
  return {
    capability: "routing",
    provider: providerName,
    async request(stops, provider) {
      const base = endpoint(provider, "route").replace(/\/+$/, "");
      const coordinates = stops
        .map((stop) => `${stop.lon},${stop.lat}`)
        .join(";");
      const url = new URL(`${base}/route/v1/driving/${coordinates}`);
      url.searchParams.set("overview", "full");
      url.searchParams.set("geometries", "geojson");

      let response: Response;
      try {
        response = await fetchImplementation(url, {
          cache: "no-store",
          headers: requestHeaders(provider),
          signal: AbortSignal.timeout(OSRM_TIMEOUT_MS),
        });
      } catch {
        return { status: "unreachable" };
      }
      if (response.status === 429) return { status: "rate-limited" };
      if (!response.ok) {
        return { status: "http-error", httpStatus: response.status };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { status: "bad-response" };
      }
      const route = parseOsrmBody(body, stops.length - 1);
      return route ? { status: "ok", route } : { status: "no-route" };
    },
  };
}

function elevationAdapter(
  providerName: string,
  fetchImplementation: FetchImplementation,
): LocationProviderAdapter<readonly [number, number][], ElevationAdapterResult> {
  return {
    capability: "elevation",
    provider: providerName,
    async request(points, provider) {
      if (points.length === 0) return { status: "unavailable" };
      const url = new URL(endpoint(provider, "elevation"));
      url.searchParams.set("latitude", points.map((point) => point[1]).join(","));
      url.searchParams.set("longitude", points.map((point) => point[0]).join(","));
      try {
        const response = await fetchImplementation(url, {
          cache: "no-store",
          headers: requestHeaders(provider),
          signal: AbortSignal.timeout(ELEVATION_TIMEOUT_MS),
        });
        if (!response.ok) return { status: "unavailable" };
        const body = (await response.json()) as { elevation?: unknown };
        if (
          !Array.isArray(body.elevation) ||
          body.elevation.length !== points.length ||
          body.elevation.some(
            (value) => typeof value !== "number" || !Number.isFinite(value),
          )
        ) {
          return { status: "unavailable" };
        }
        return { status: "ok", elevations: body.elevation as number[] };
      } catch {
        return { status: "unavailable" };
      }
    },
  };
}

export function requestRoadtripRoute(
  policy: LocationProviderPolicy,
  stops: readonly RoadtripStop[],
  fetchImplementation: FetchImplementation = fetch,
): Promise<RoutingProviderRequest> {
  return policy.request("routing", stops, {
    public: routingAdapter(
      PUBLIC_LOCATION_PROVIDERS.routing.id,
      fetchImplementation,
    ),
    custom: (provider) => routingAdapter(provider.provider, fetchImplementation),
  });
}

export function requestRouteElevations(
  policy: LocationProviderPolicy,
  points: readonly [number, number][],
  fetchImplementation: FetchImplementation = fetch,
): Promise<ElevationProviderRequest> {
  return policy.request("elevation", points, {
    public: elevationAdapter(
      PUBLIC_LOCATION_PROVIDERS.elevation.id,
      fetchImplementation,
    ),
    custom: (provider) => elevationAdapter(provider.provider, fetchImplementation),
  });
}
