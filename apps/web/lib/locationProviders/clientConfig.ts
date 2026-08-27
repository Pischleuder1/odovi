import type {
  DisabledReason,
  LocationProviderPolicy,
  LocationProviderResolution,
} from "@odovi/core";

export interface DisabledLocationCapabilityConfig {
  status: "disabled";
  reason: DisabledReason;
  requiresReview: boolean;
}

export interface ActiveMapTileConfig {
  status: "active";
  mode: "public" | "custom";
  provider: string;
  urlTemplate: string;
  attribution: {
    label: string;
    href: string;
  };
}

export type MapTileConfig =
  | DisabledLocationCapabilityConfig
  | ActiveMapTileConfig;

export interface ActiveExternalNavigationConfig {
  status: "active";
  mode: "public" | "custom";
  provider: string;
  endpoint: string;
}

export type ExternalNavigationConfig =
  | DisabledLocationCapabilityConfig
  | ActiveExternalNavigationConfig;

export interface LocationProviderClientConfig {
  mapTiles: MapTileConfig;
  externalNavigation: ExternalNavigationConfig;
}

export const CUSTOM_MAP_TILE_PROXY_TEMPLATE =
  "/api/location-providers/map-tiles/{z}/{x}/{y}";

function disabledConfig(
  resolution: Extract<LocationProviderResolution, { status: "disabled" }>,
): DisabledLocationCapabilityConfig {
  return {
    status: "disabled",
    reason: resolution.reason,
    requiresReview: resolution.requiresReview,
  };
}

export function mapTileClientConfig(
  resolution: LocationProviderResolution,
): MapTileConfig {
  if (resolution.status === "disabled") return disabledConfig(resolution);

  const urlTemplate =
    resolution.mode === "public"
      ? resolution.endpoints.tiles
      : CUSTOM_MAP_TILE_PROXY_TEMPLATE;
  if (!urlTemplate) {
    return {
      status: "disabled",
      reason: "invalid-configuration",
      requiresReview: true,
    };
  }

  return {
    status: "active",
    mode: resolution.mode,
    provider: resolution.provider,
    urlTemplate,
    attribution: {
      label:
        resolution.mode === "public"
          ? "© OpenStreetMap contributors"
          : resolution.provider,
      href:
        resolution.mode === "public"
          ? (resolution.endpoints.attribution ?? resolution.contactUrl)
          : resolution.contactUrl,
    },
  };
}

export function externalNavigationClientConfig(
  resolution: LocationProviderResolution,
): ExternalNavigationConfig {
  if (resolution.status === "disabled") return disabledConfig(resolution);

  const endpoint =
    resolution.mode === "public"
      ? resolution.endpoints.directions
      : resolution.endpoints.default;
  if (!endpoint) {
    return {
      status: "disabled",
      reason: "invalid-configuration",
      requiresReview: true,
    };
  }

  return {
    status: "active",
    mode: resolution.mode,
    provider: resolution.provider,
    endpoint,
  };
}

export function locationProviderClientConfig(
  policy: LocationProviderPolicy,
): LocationProviderClientConfig {
  return {
    mapTiles: mapTileClientConfig(policy.resolve("mapTiles")),
    externalNavigation: externalNavigationClientConfig(
      policy.resolve("externalNavigation"),
    ),
  };
}

export function buildExternalNavigationUrl(
  config: ActiveExternalNavigationConfig,
  destination: { lat: number; lon: number },
): string | null {
  if (
    !Number.isFinite(destination.lat) ||
    !Number.isFinite(destination.lon) ||
    destination.lat < -90 ||
    destination.lat > 90 ||
    destination.lon < -180 ||
    destination.lon > 180
  ) {
    return null;
  }

  const coordinates = `${destination.lat},${destination.lon}`;
  const endpoint = config.endpoint
    .replaceAll("{lat}", encodeURIComponent(String(destination.lat)))
    .replaceAll("{lon}", encodeURIComponent(String(destination.lon)));
  const url = new URL(endpoint);
  if (!config.endpoint.includes("{lat}") && !config.endpoint.includes("{lon}")) {
    url.searchParams.set("destination", coordinates);
  }
  if (config.mode === "public") url.searchParams.set("api", "1");
  return url.toString();
}
