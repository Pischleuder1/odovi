export const LOCATION_CAPABILITIES = [
  "weather",
  "elevation",
  "mapTiles",
  "addressSearch",
  "routing",
  "externalNavigation",
] as const;

export type LocationCapability = (typeof LOCATION_CAPABILITIES)[number];
export type ProviderMode = "disabled" | "public" | "custom";

export const LOCATION_PROVIDER_DISCLOSURE_VERSION = "2026-08-26";

export const LOCATION_PROVIDER_CREDENTIAL_ENV = {
  weather: "ODOVI_LOCATION_PROVIDER_WEATHER_CREDENTIAL",
  elevation: "ODOVI_LOCATION_PROVIDER_ELEVATION_CREDENTIAL",
  mapTiles: "ODOVI_LOCATION_PROVIDER_MAP_TILES_CREDENTIAL",
  addressSearch: "ODOVI_LOCATION_PROVIDER_ADDRESS_SEARCH_CREDENTIAL",
  routing: "ODOVI_LOCATION_PROVIDER_ROUTING_CREDENTIAL",
  externalNavigation: "ODOVI_LOCATION_PROVIDER_EXTERNAL_NAVIGATION_CREDENTIAL",
} as const satisfies Record<LocationCapability, string>;

export interface CapabilityDisclosure {
  capability: LocationCapability;
  purpose: string;
  transmittedData: string;
  richerExperience: string;
}

export interface PublicProviderDefinition {
  capability: LocationCapability;
  id: string;
  name: string;
  contactUrl: string;
  operatingLimits: string;
  disclosureVersion: string;
  endpoints: Readonly<Record<string, string>>;
}

export const LOCATION_CAPABILITY_DISCLOSURES: Record<
  LocationCapability,
  CapabilityDisclosure
> = {
  weather: {
    capability: "weather",
    purpose: "Show current weather and add historical weather to archived drives.",
    transmittedData: "Exact or rounded journey coordinates and the requested time or date.",
    richerExperience: "Weather cards and historical weather context for drives.",
  },
  elevation: {
    capability: "elevation",
    purpose: "Add elevation values to archived and planned route points.",
    transmittedData: "Exact or sampled route coordinates.",
    richerExperience: "Elevation profiles, ascent and descent, and route energy estimates.",
  },
  mapTiles: {
    capability: "mapTiles",
    purpose: "Load a geographic background for interactive maps.",
    transmittedData: "The visible map area as tile coordinates, plus normal browser request data.",
    richerExperience: "Interactive map backgrounds behind locally stored routes and places.",
  },
  addressSearch: {
    capability: "addressSearch",
    purpose: "Turn an entered place or address into coordinates.",
    transmittedData: "The submitted search text, language, and normal server request data.",
    richerExperience: "Address suggestions when creating places or planning a trip.",
  },
  routing: {
    capability: "routing",
    purpose: "Calculate a road route between selected waypoints.",
    transmittedData: "Exact start, destination, and intermediate waypoint coordinates.",
    richerExperience: "Calculated road distance, duration, geometry, and route forecasts.",
  },
  externalNavigation: {
    capability: "externalNavigation",
    purpose: "Open a selected destination in an external navigation service.",
    transmittedData: "The destination coordinates selected for that explicit handoff.",
    richerExperience: "One-click handoff from a saved roadtrip to turn-by-turn navigation.",
  },
};

export const PUBLIC_LOCATION_PROVIDERS: Record<
  LocationCapability,
  PublicProviderDefinition
> = {
  weather: {
    capability: "weather",
    id: "open-meteo",
    name: "Open-Meteo",
    contactUrl: "https://open-meteo.com/en/contact",
    operatingLimits:
      "Public access is best-effort and must be treated as evaluation or permitted personal/non-commercial use unless the operator has suitable terms.",
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
    endpoints: {
      forecast: "https://api.open-meteo.com/v1/forecast",
      archive: "https://archive-api.open-meteo.com/v1/archive",
    },
  },
  elevation: {
    capability: "elevation",
    id: "open-meteo",
    name: "Open-Meteo",
    contactUrl: "https://open-meteo.com/en/contact",
    operatingLimits:
      "Public access is best-effort and must be treated as evaluation or permitted personal/non-commercial use unless the operator has suitable terms.",
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
    endpoints: { elevation: "https://api.open-meteo.com/v1/elevation" },
  },
  mapTiles: {
    capability: "mapTiles",
    id: "openstreetmap",
    name: "OpenStreetMap tile service",
    contactUrl: "https://operations.osmfoundation.org/policies/tiles/",
    operatingLimits:
      "Ordinary interactive viewing only, with attribution and normal browser caching; no bulk download or offline prefetch.",
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
    endpoints: {
      tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "https://www.openstreetmap.org/copyright",
    },
  },
  addressSearch: {
    capability: "addressSearch",
    id: "nominatim",
    name: "OpenStreetMap Nominatim",
    contactUrl: "https://operations.osmfoundation.org/policies/nominatim/",
    operatingLimits:
      "Low-volume, identified, user-triggered searches only; public use is rate-limited and has no availability guarantee.",
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
    endpoints: { search: "https://nominatim.openstreetmap.org/search" },
  },
  routing: {
    capability: "routing",
    id: "osrm-demo",
    name: "OSRM public demo server",
    contactUrl: "https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy",
    operatingLimits:
      "Evaluation use only; the demo service is rate-limited, has no SLA, and is not reliable production routing.",
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
    endpoints: { route: "https://router.project-osrm.org" },
  },
  externalNavigation: {
    capability: "externalNavigation",
    id: "google-maps",
    name: "Google Maps",
    contactUrl: "https://policies.google.com/privacy",
    operatingLimits:
      "The destination is handed to an independent external service only after an explicit click; its terms and availability apply.",
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
    endpoints: { directions: "https://www.google.com/maps/dir/" },
  },
};

export interface ProviderDecision {
  decisionId: number;
  capability: LocationCapability;
  mode: ProviderMode;
  provider: string;
  disclosureVersion: string;
  decidedAt: Date | string;
  endpoint?: string | null;
  credentialHeader?: string | null;
  customContactUrl?: string | null;
  customOperatingLimits?: string | null;
}

export type DisabledReason =
  | "not-reviewed"
  | "disabled"
  | "disclosure-changed"
  | "invalid-configuration";

export interface DisabledProviderResolution {
  status: "disabled";
  capability: LocationCapability;
  reason: DisabledReason;
  issues: readonly string[];
  requiresReview: boolean;
  decision: ProviderDecision | null;
  disclosure: CapabilityDisclosure;
}

export interface ActiveProviderResolution {
  status: "active";
  capability: LocationCapability;
  mode: "public" | "custom";
  provider: string;
  disclosureVersion: string;
  decidedAt: string;
  contactUrl: string;
  operatingLimits: string;
  endpoints: Readonly<Record<string, string>>;
  credentialHeader: string | null;
  credential: string | null;
  disclosure: CapabilityDisclosure;
}

export type LocationProviderResolution =
  | DisabledProviderResolution
  | ActiveProviderResolution;

export interface LocationProviderAdapter<Request, Result> {
  readonly capability: LocationCapability;
  readonly provider: string;
  request(input: Request, provider: ActiveProviderResolution): Promise<Result>;
}

export type ProviderRequestResult<Result> =
  | { status: "disabled"; resolution: DisabledProviderResolution }
  | { status: "ok"; value: Result; resolution: ActiveProviderResolution };

export type CredentialEnvironment = Record<string, string | undefined>;

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function isCapability(value: string): value is LocationCapability {
  return (LOCATION_CAPABILITIES as readonly string[]).includes(value);
}

function currentVersion(capability: LocationCapability): string {
  return PUBLIC_LOCATION_PROVIDERS[capability].disclosureVersion;
}

function validHttpUrl(
  value: string,
  label: string,
  issues: string[],
  options: { baseUrl?: boolean } = {},
): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      issues.push(`${label} must use http or https`);
      return null;
    }
    if (url.username || url.password) {
      issues.push(`${label} must not contain credentials`);
      return null;
    }
    if (options.baseUrl && (url.search || url.hash)) {
      issues.push(`${label} must not contain a query string or fragment`);
      return null;
    }
    return value;
  } catch {
    issues.push(`${label} must be an absolute URL`);
    return null;
  }
}

function latestDecisions(
  decisions: readonly ProviderDecision[],
): Partial<Record<LocationCapability, ProviderDecision>> {
  const latest: Partial<Record<LocationCapability, ProviderDecision>> = {};
  for (const decision of decisions) {
    if (!isCapability(decision.capability)) continue;
    const current = latest[decision.capability];
    if (!current || decision.decisionId > current.decisionId) {
      latest[decision.capability] = decision;
    }
  }
  return latest;
}

export class LocationProviderPolicy {
  private readonly decisions: Partial<Record<LocationCapability, ProviderDecision>>;

  constructor(
    decisions: readonly ProviderDecision[],
    private readonly credentials: CredentialEnvironment = {},
  ) {
    this.decisions = latestDecisions(decisions);
  }

  resolve(capability: LocationCapability): LocationProviderResolution {
    const decision = this.decisions[capability] ?? null;
    const disclosure = LOCATION_CAPABILITY_DISCLOSURES[capability];
    if (!decision) {
      return {
        status: "disabled",
        capability,
        reason: "not-reviewed",
        issues: [],
        requiresReview: true,
        decision: null,
        disclosure,
      };
    }

    if (decision.disclosureVersion !== currentVersion(capability)) {
      return {
        status: "disabled",
        capability,
        reason: "disclosure-changed",
        issues: [],
        requiresReview: true,
        decision,
        disclosure,
      };
    }

    if (decision.mode === "disabled") {
      return {
        status: "disabled",
        capability,
        reason: "disabled",
        issues: [],
        requiresReview: false,
        decision,
        disclosure,
      };
    }

    const issues: string[] = [];
    const decidedAt = new Date(decision.decidedAt);
    if (!Number.isFinite(decidedAt.getTime())) issues.push("decision time is invalid");

    if (decision.mode === "public") {
      const definition = PUBLIC_LOCATION_PROVIDERS[capability];
      if (decision.provider !== definition.id) {
        issues.push(`public provider must be ${definition.id}`);
      }
      if (issues.length > 0) return this.invalid(capability, decision, issues);
      return {
        status: "active",
        capability,
        mode: "public",
        provider: definition.id,
        disclosureVersion: decision.disclosureVersion,
        decidedAt: decidedAt.toISOString(),
        contactUrl: definition.contactUrl,
        operatingLimits: definition.operatingLimits,
        endpoints: definition.endpoints,
        credentialHeader: null,
        credential: null,
        disclosure,
      };
    }

    if (decision.mode !== "custom") {
      return this.invalid(capability, decision, ["provider mode is invalid"]);
    }

    const provider = decision.provider.trim();
    if (!provider || provider === "none") issues.push("custom provider name is required");
    const endpoint = validHttpUrl(
      decision.endpoint?.trim() ?? "",
      "custom endpoint",
      issues,
      { baseUrl: true },
    );
    const contactUrl = validHttpUrl(
      decision.customContactUrl?.trim() ?? "",
      "custom contact path",
      issues,
    );
    const operatingLimits = decision.customOperatingLimits?.trim() ?? "";
    if (!operatingLimits) issues.push("custom operating limits are required");

    const credentialHeader = decision.credentialHeader?.trim() || null;
    let credential: string | null = null;
    if (credentialHeader) {
      if (!HEADER_NAME.test(credentialHeader)) {
        issues.push("credential header is invalid");
      } else {
        const envName = LOCATION_PROVIDER_CREDENTIAL_ENV[capability];
        credential = this.credentials[envName]?.trim() || null;
        if (!credential) issues.push(`${envName} is required for the configured credential header`);
      }
    }

    if (issues.length > 0 || !endpoint || !contactUrl) {
      return this.invalid(capability, decision, issues);
    }

    return {
      status: "active",
      capability,
      mode: "custom",
      provider,
      disclosureVersion: decision.disclosureVersion,
      decidedAt: decidedAt.toISOString(),
      contactUrl,
      operatingLimits,
      endpoints: { default: endpoint },
      credentialHeader,
      credential,
      disclosure,
    };
  }

  reviewRequired(): boolean {
    return LOCATION_CAPABILITIES.some((capability) => {
      const resolution = this.resolve(capability);
      return resolution.status === "disabled" && resolution.requiresReview;
    });
  }

  async request<Request, Result>(
    capability: LocationCapability,
    input: Request,
    adapters: {
      public: LocationProviderAdapter<Request, Result>;
      custom: (provider: ActiveProviderResolution) => LocationProviderAdapter<Request, Result>;
    },
  ): Promise<ProviderRequestResult<Result>> {
    const resolution = this.resolve(capability);
    if (resolution.status === "disabled") return { status: "disabled", resolution };

    const adapter =
      resolution.mode === "public" ? adapters.public : adapters.custom(resolution);
    if (adapter.capability !== capability || adapter.provider !== resolution.provider) {
      throw new Error(
        `Location provider adapter mismatch for ${capability}: expected ${resolution.provider}`,
      );
    }
    return {
      status: "ok",
      value: await adapter.request(input, resolution),
      resolution,
    };
  }

  private invalid(
    capability: LocationCapability,
    decision: ProviderDecision,
    issues: readonly string[],
  ): DisabledProviderResolution {
    return {
      status: "disabled",
      capability,
      reason: "invalid-configuration",
      issues,
      requiresReview: true,
      decision,
      disclosure: LOCATION_CAPABILITY_DISCLOSURES[capability],
    };
  }
}

export function createDisabledProviderDecision(
  capability: LocationCapability,
  decisionId = 0,
  decidedAt: Date | string = new Date(),
): ProviderDecision {
  return {
    decisionId,
    capability,
    mode: "disabled",
    provider: "none",
    disclosureVersion: currentVersion(capability),
    decidedAt,
  };
}

export function createPublicProviderDecision(
  capability: LocationCapability,
  decisionId = 0,
  decidedAt: Date | string = new Date(),
): ProviderDecision {
  return {
    decisionId,
    capability,
    mode: "public",
    provider: PUBLIC_LOCATION_PROVIDERS[capability].id,
    disclosureVersion: currentVersion(capability),
    decidedAt,
  };
}
