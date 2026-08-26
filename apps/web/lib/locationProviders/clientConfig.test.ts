import { describe, expect, it } from "vitest";
import {
  LOCATION_PROVIDER_DISCLOSURE_VERSION,
  LocationProviderPolicy,
  createPublicProviderDecision,
  type ProviderDecision,
} from "@odovi/core";
import {
  CUSTOM_MAP_TILE_PROXY_TEMPLATE,
  buildExternalNavigationUrl,
  externalNavigationClientConfig,
  mapTileClientConfig,
} from "./clientConfig";

const now = "2026-08-26T12:00:00.000Z";

function customDecision(
  capability: "mapTiles" | "externalNavigation",
  endpoint: string,
): ProviderDecision {
  return {
    decisionId: 1,
    capability,
    mode: "custom",
    provider: "Controlled provider",
    endpoint,
    credentialHeader: null,
    customContactUrl: "https://provider.test/policy",
    customOperatingLimits: "Controlled test endpoint only.",
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
    decidedAt: now,
  };
}

describe("map tile client configuration", () => {
  it("exposes no endpoint while the capability is disabled", () => {
    const config = mapTileClientConfig(
      new LocationProviderPolicy([]).resolve("mapTiles"),
    );

    expect(config).toEqual({
      status: "disabled",
      reason: "not-reviewed",
      requiresReview: true,
    });
    expect(config).not.toHaveProperty("urlTemplate");
  });

  it("centralizes public OSM tiles and linked attribution", () => {
    const config = mapTileClientConfig(
      new LocationProviderPolicy([
        createPublicProviderDecision("mapTiles", 1, now),
      ]).resolve("mapTiles"),
    );

    expect(config).toMatchObject({
      status: "active",
      mode: "public",
      provider: "openstreetmap",
      urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: {
        label: "© OpenStreetMap contributors",
        href: "https://www.openstreetmap.org/copyright",
      },
    });
  });

  it("routes a custom endpoint through the credential-safe proxy", () => {
    const config = mapTileClientConfig(
      new LocationProviderPolicy([
        customDecision("mapTiles", "https://tiles.test/{z}/{x}/{y}.png"),
      ]).resolve("mapTiles"),
    );

    expect(config).toMatchObject({
      status: "active",
      mode: "custom",
      urlTemplate: CUSTOM_MAP_TILE_PROXY_TEMPLATE,
      attribution: {
        label: "Controlled provider",
        href: "https://provider.test/policy",
      },
    });
  });
});

describe("external navigation client configuration", () => {
  it("does not create a Google URL while navigation is disabled", () => {
    const config = externalNavigationClientConfig(
      new LocationProviderPolicy([]).resolve("externalNavigation"),
    );
    expect(config.status).toBe("disabled");
    expect(config).not.toHaveProperty("endpoint");
  });

  it("builds the disclosed destination only for an active click handler", () => {
    const config = externalNavigationClientConfig(
      new LocationProviderPolicy([
        createPublicProviderDecision("externalNavigation", 1, now),
      ]).resolve("externalNavigation"),
    );
    expect(config.status).toBe("active");
    if (config.status !== "active") throw new Error("expected active config");

    const url = new URL(
      buildExternalNavigationUrl(config, { lat: 47.123, lon: 8.456 })!,
    );
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("47.123,8.456");
  });

  it("supports custom destination placeholders without code changes", () => {
    const config = externalNavigationClientConfig(
      new LocationProviderPolicy([
        customDecision(
          "externalNavigation",
          "https://navigation.test/go/{lat}/{lon}",
        ),
      ]).resolve("externalNavigation"),
    );
    expect(config.status).toBe("active");
    if (config.status !== "active") throw new Error("expected active config");

    expect(
      buildExternalNavigationUrl(config, { lat: 47.1, lon: 8.5 }),
    ).toBe("https://navigation.test/go/47.1/8.5");
  });
});
