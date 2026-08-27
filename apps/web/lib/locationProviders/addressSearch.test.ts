import { describe, expect, it, vi } from "vitest";
import {
  LOCATION_PROVIDER_DISCLOSURE_VERSION,
  LocationProviderPolicy,
  createPublicProviderDecision,
  type ProviderDecision,
} from "@odovi/core";
import {
  AddressSearchService,
  NOMINATIM_USER_AGENT,
  searchAddressWithPolicy,
} from "./addressSearch";

function payload(label = "Berlin"): unknown[] {
  return [
    {
      display_name: label,
      lat: "52.52",
      lon: "13.405",
      address: { city: label },
    },
  ];
}

function response(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function publicPolicy(): LocationProviderPolicy {
  return new LocationProviderPolicy([
    createPublicProviderDecision("addressSearch", 1, "2026-08-26T10:00:00Z"),
  ]);
}

function customPolicy(): LocationProviderPolicy {
  const decision: ProviderDecision = {
    decisionId: 1,
    capability: "addressSearch",
    mode: "custom",
    provider: "Private geocoder",
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
    decidedAt: "2026-08-26T10:00:00Z",
    endpoint: "https://geo.example.test/search",
    credentialHeader: "X-Api-Key",
    customContactUrl: "https://geo.example.test/about",
    customOperatingLimits: "Operator-managed service.",
  };
  return new LocationProviderPolicy([decision], {
    ODOVI_LOCATION_PROVIDER_ADDRESS_SEARCH_CREDENTIAL: "secret",
  });
}

describe("controlled address search", () => {
  it("does not invoke a provider when address search is disabled", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const service = new AddressSearchService({ fetch: fetcher });

    await expect(
      searchAddressWithPolicy(
        new LocationProviderPolicy([]),
        { query: "Berlin", language: "en" },
        service,
      ),
    ).resolves.toMatchObject({ status: "disabled", results: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects invalid input before any outbound request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const service = new AddressSearchService({ fetch: fetcher });

    await expect(
      searchAddressWithPolicy(
        publicPolicy(),
        { query: "  x ", language: "en" },
        service,
      ),
    ).resolves.toEqual({ status: "invalid", results: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("identifies public requests and uses the documented search parameters", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response(payload()));
    const service = new AddressSearchService({ fetch: fetcher, timeoutSignal: () => undefined });

    const result = await searchAddressWithPolicy(
      publicPolicy(),
      { query: "Berlin Hauptbahnhof", language: "de" },
      service,
    );

    expect(result).toMatchObject({
      status: "ok",
      source: "provider",
      attribution: {
        label: "© OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/copyright",
      },
    });
    const [url, init] = fetcher.mock.calls[0]!;
    const requestUrl = new URL(String(url));
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://nominatim.openstreetmap.org/search",
    );
    expect(Object.fromEntries(requestUrl.searchParams)).toMatchObject({
      q: "Berlin Hauptbahnhof",
      format: "jsonv2",
      limit: "5",
      addressdetails: "1",
      "accept-language": "de",
    });
    expect(new Headers(init?.headers).get("user-agent")).toBe(NOMINATIM_USER_AGENT);
  });

  it("globally limits uncached public requests to one per second", async () => {
    let now = 10_000;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response(payload()));
    const service = new AddressSearchService({
      fetch: fetcher,
      now: () => now,
      timeoutSignal: () => undefined,
    });

    await searchAddressWithPolicy(
      publicPolicy(),
      { query: "Berlin", language: "en" },
      service,
    );
    now += 999;
    await expect(
      searchAddressWithPolicy(
        publicPolicy(),
        { query: "Hamburg", language: "en" },
        service,
      ),
    ).resolves.toMatchObject({ status: "rate-limited", retryAfterMs: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    now += 1;
    await searchAddressWithPolicy(
      publicPolicy(),
      { query: "Hamburg", language: "en" },
      service,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("lets only one simultaneous public request pass the shared gate", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response(payload()));
    const service = new AddressSearchService({
      fetch: fetcher,
      now: () => 10_000,
      timeoutSignal: () => undefined,
    });

    const results = await Promise.all([
      searchAddressWithPolicy(
        publicPolicy(),
        { query: "Berlin", language: "en" },
        service,
      ),
      searchAddressWithPolicy(
        publicPolicy(),
        { query: "Hamburg", language: "en" },
        service,
      ),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["ok", "rate-limited"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves equivalent requests from a bounded cache", async () => {
    let now = 1_000;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response(payload()));
    const service = new AddressSearchService({
      fetch: fetcher,
      now: () => now,
      maxCacheEntries: 2,
      timeoutSignal: () => undefined,
    });

    await searchAddressWithPolicy(
      publicPolicy(),
      { query: "  BERLIN   Hauptbahnhof ", language: "de" },
      service,
    );
    const cached = await searchAddressWithPolicy(
      publicPolicy(),
      { query: "berlin hauptbahnhof", language: "de" },
      service,
    );
    expect(cached).toMatchObject({ status: "ok", source: "cache" });
    expect(fetcher).toHaveBeenCalledTimes(1);

    for (const query of ["Hamburg", "München", "Berlin Hauptbahnhof"]) {
      now += 1_000;
      await searchAddressWithPolicy(publicPolicy(), { query, language: "de" }, service);
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("keeps empty, provider-rate-limit, and upstream-failure states controlled", async () => {
    const emptyService = new AddressSearchService({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response([])),
      timeoutSignal: () => undefined,
    });
    await expect(
      searchAddressWithPolicy(
        publicPolicy(),
        { query: "Nothing here", language: "en" },
        emptyService,
      ),
    ).resolves.toMatchObject({ status: "empty", source: "provider" });
    await expect(
      searchAddressWithPolicy(
        publicPolicy(),
        { query: "  nothing HERE ", language: "en" },
        emptyService,
      ),
    ).resolves.toMatchObject({ status: "empty", source: "cache" });

    const limitedService = new AddressSearchService({
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({}, { status: 429, headers: { "retry-after": "3" } })),
      timeoutSignal: () => undefined,
    });
    await expect(
      searchAddressWithPolicy(
        publicPolicy(),
        { query: "Berlin", language: "en" },
        limitedService,
      ),
    ).resolves.toMatchObject({ status: "rate-limited", retryAfterMs: 3_000 });

    for (const fetcher of [
      vi.fn<typeof fetch>().mockResolvedValue(response({}, { status: 503 })),
      vi.fn<typeof fetch>().mockResolvedValue(response({ unexpected: true })),
      vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
    ]) {
      const service = new AddressSearchService({ fetch: fetcher, timeoutSignal: () => undefined });
      await expect(
        searchAddressWithPolicy(
          publicPolicy(),
          { query: "Berlin", language: "en" },
          service,
        ),
      ).resolves.toMatchObject({ status: "upstream-failure" });
    }
  });

  it("uses the activated custom endpoint and runtime-only credential", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(payload("Zurich")));
    const service = new AddressSearchService({ fetch: fetcher, timeoutSignal: () => undefined });

    const result = await searchAddressWithPolicy(
      customPolicy(),
      { query: "Zurich", language: "en" },
      service,
    );

    expect(result).toMatchObject({
      status: "ok",
      attribution: {
        label: "Private geocoder",
        url: "https://geo.example.test/about",
      },
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain("https://geo.example.test/search?");
    expect(new Headers(init?.headers).get("x-api-key")).toBe("secret");
    expect(new Headers(init?.headers).get("user-agent")).toBeNull();
  });
});
