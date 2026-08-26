import { describe, expect, it, vi } from "vitest";
import {
  LOCATION_PROVIDER_CREDENTIAL_ENV,
  LOCATION_PROVIDER_DISCLOSURE_VERSION,
  LocationProviderPolicy,
  createDisabledProviderDecision,
  createPublicProviderDecision,
  type LocationProviderAdapter,
  type ProviderDecision,
} from "./policy.js";

function customDecision(overrides: Partial<ProviderDecision> = {}): ProviderDecision {
  return {
    decisionId: 1,
    capability: "routing",
    mode: "custom",
    provider: "Home OSRM",
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
    decidedAt: "2026-08-26T10:00:00.000Z",
    endpoint: "http://router.internal:5000",
    customContactUrl: "https://example.test/provider-help",
    customOperatingLimits: "Private installation maintained by the operator.",
    ...overrides,
  };
}

describe("LocationProviderPolicy", () => {
  it("keeps every capability independently disabled before Provider Review", () => {
    const policy = new LocationProviderPolicy([]);

    expect(policy.reviewRequired()).toBe(true);
    expect(policy.resolve("weather")).toMatchObject({
      status: "disabled",
      reason: "not-reviewed",
      requiresReview: true,
    });
    expect(policy.resolve("routing")).toMatchObject({ status: "disabled" });
  });

  it("resolves the disclosed public provider only after activation", () => {
    const policy = new LocationProviderPolicy([
      createPublicProviderDecision("addressSearch", 1, "2026-08-26T10:00:00Z"),
    ]);

    expect(policy.resolve("addressSearch")).toMatchObject({
      status: "active",
      mode: "public",
      provider: "nominatim",
      endpoints: { search: "https://nominatim.openstreetmap.org/search" },
    });
    expect(policy.resolve("weather")).toMatchObject({
      status: "disabled",
      reason: "not-reviewed",
    });
  });

  it("resolves a runtime-configurable custom endpoint and credential", () => {
    const decision = customDecision({ credentialHeader: "X-Api-Key" });
    const policy = new LocationProviderPolicy([decision], {
      [LOCATION_PROVIDER_CREDENTIAL_ENV.routing]: "controlled-secret",
    });

    expect(policy.resolve("routing")).toMatchObject({
      status: "active",
      mode: "custom",
      provider: "Home OSRM",
      endpoints: { default: "http://router.internal:5000" },
      credentialHeader: "X-Api-Key",
      credential: "controlled-secret",
    });
  });

  it("rejects incomplete and contradictory custom configuration", () => {
    const policy = new LocationProviderPolicy([
      customDecision({
        endpoint: "not-a-url",
        customContactUrl: "",
        customOperatingLimits: "",
        credentialHeader: "X Api Key",
      }),
    ]);

    const resolution = policy.resolve("routing");
    expect(resolution).toMatchObject({
      status: "disabled",
      reason: "invalid-configuration",
      requiresReview: true,
    });
    if (resolution.status !== "disabled") throw new Error("expected disabled resolution");
    expect(resolution.issues).toEqual(
      expect.arrayContaining([
        "custom endpoint must be an absolute URL",
        "custom contact path must be an absolute URL",
        "custom operating limits are required",
        "credential header is invalid",
      ]),
    );
  });

  it("requires renewed review when a stored disclosure version changes", () => {
    const stale = {
      ...createPublicProviderDecision("weather", 1),
      disclosureVersion: "2026-01-01",
    };
    expect(new LocationProviderPolicy([stale]).resolve("weather")).toMatchObject({
      status: "disabled",
      reason: "disclosure-changed",
      requiresReview: true,
    });
  });

  it("uses the latest append-only decision so reversal stops adapter calls", async () => {
    const request = vi.fn(async () => "unexpected");
    const adapter: LocationProviderAdapter<string, string> = {
      capability: "routing",
      provider: "osrm-demo",
      request,
    };
    const policy = new LocationProviderPolicy([
      createPublicProviderDecision("routing", 1, "2026-08-26T10:00:00Z"),
      createDisabledProviderDecision("routing", 2, "2026-08-26T11:00:00Z"),
    ]);

    const result = await policy.request("routing", "47,8", {
      public: adapter,
      custom: () => adapter,
    });
    expect(result.status).toBe("disabled");
    expect(request).not.toHaveBeenCalled();
  });

  it("invokes only a matching controlled adapter behind the policy", async () => {
    const request = vi.fn(async (input: string) => `route:${input}`);
    const adapter: LocationProviderAdapter<string, string> = {
      capability: "routing",
      provider: "osrm-demo",
      request,
    };
    const policy = new LocationProviderPolicy([
      createPublicProviderDecision("routing", 1, "2026-08-26T10:00:00Z"),
    ]);

    await expect(
      policy.request("routing", "47,8", {
        public: adapter,
        custom: () => adapter,
      }),
    ).resolves.toMatchObject({ status: "ok", value: "route:47,8" });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
