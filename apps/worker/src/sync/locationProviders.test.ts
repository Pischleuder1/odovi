import {
  LocationProviderPolicy,
  createPublicProviderDecision,
  type ActiveProviderResolution,
  type ProviderDecision,
} from "@odovi/core";
import type { Db } from "@odovi/db";
import { describe, expect, it, vi } from "vitest";
import { fetchHourlyWeather, syncDriveWeather } from "./driveWeather.js";
import { fetchElevations, syncElevations } from "./elevation.js";

function activePublic(capability: "weather" | "elevation"): ActiveProviderResolution {
  const resolution = new LocationProviderPolicy([
    createPublicProviderDecision(capability, 1, "2026-08-26T10:00:00Z"),
  ]).resolve(capability);
  if (resolution.status !== "active") throw new Error("expected active provider");
  return resolution;
}

function activeCustom(
  capability: "weather" | "elevation",
  endpoint: string,
): ActiveProviderResolution {
  const decision: ProviderDecision = {
    decisionId: 1,
    capability,
    mode: "custom",
    provider: "local-provider",
    endpoint,
    credentialHeader: "X-Odovi-Key",
    customContactUrl: "https://provider.example/contact",
    customOperatingLimits: "Privately operated endpoint.",
    disclosureVersion: "2026-08-26",
    decidedAt: "2026-08-26T10:00:00Z",
  };
  const credentialName =
    capability === "weather"
      ? "ODOVI_LOCATION_PROVIDER_WEATHER_CREDENTIAL"
      : "ODOVI_LOCATION_PROVIDER_ELEVATION_CREDENTIAL";
  const resolution = new LocationProviderPolicy([decision], {
    [credentialName]: "secret-value",
  }).resolve(capability);
  if (resolution.status !== "active") throw new Error("expected active provider");
  return resolution;
}

describe("worker location providers", () => {
  it("does not read data or make requests when weather and elevation are disabled", async () => {
    const unusableDb = new Proxy(
      {},
      {
        get() {
          throw new Error("database must not be touched");
        },
      },
    ) as Db;

    await expect(syncElevations(unusableDb, null)).resolves.toEqual({ pointsFilled: 0 });
    await expect(syncDriveWeather(unusableDb, null)).resolves.toEqual({ drivesFilled: 0 });
  });

  it("uses the activated public elevation endpoint", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ elevation: [123, 456] }), { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(
      fetchElevations(
        activePublic("elevation"),
        [
          { id: 1, lat: 48.1, lon: 11.5 },
          { id: 2, lat: 48.2, lon: 11.6 },
        ],
        fetcher,
      ),
    ).resolves.toEqual([123, 456]);

    const [request] = vi.mocked(fetcher).mock.calls[0]!;
    const url = new URL(String(request));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/elevation");
    expect(url.searchParams.get("latitude")).toBe("48.1,48.2");
    expect(url.searchParams.get("longitude")).toBe("11.5,11.6");
  });

  it("keeps a custom weather provider on its configured endpoint and credential", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          hourly: {
            temperature_2m: [20],
            precipitation: [0],
            wind_speed_10m: [8],
            weather_code: [1],
            time: ["2026-08-26T10:00"],
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    await fetchHourlyWeather(
      activeCustom("weather", "https://weather.example/hourly"),
      "archive",
      48.1,
      11.5,
      "2026-08-25",
      "2026-08-25",
      undefined,
      fetcher,
    );

    const [request, init] = vi.mocked(fetcher).mock.calls[0]!;
    const url = new URL(String(request));
    expect(url.origin + url.pathname).toBe("https://weather.example/hourly");
    expect(new Headers(init?.headers).get("X-Odovi-Key")).toBe("secret-value");
  });

  it("keeps weather and elevation activation decisions independent", () => {
    const policy = new LocationProviderPolicy([
      createPublicProviderDecision("weather", 1, "2026-08-26T10:00:00Z"),
    ]);

    expect(policy.resolve("weather").status).toBe("active");
    expect(policy.resolve("elevation")).toMatchObject({
      status: "disabled",
      reason: "not-reviewed",
    });
  });

  it("keeps an invalid custom provider disabled before an adapter can run", async () => {
    const decision: ProviderDecision = {
      decisionId: 1,
      capability: "weather",
      mode: "custom",
      provider: "broken-provider",
      endpoint: "not-a-url",
      customContactUrl: "https://provider.example/contact",
      customOperatingLimits: "Private endpoint.",
      disclosureVersion: "2026-08-26",
      decidedAt: "2026-08-26T10:00:00Z",
    };
    const request = vi.fn();
    const result = await new LocationProviderPolicy([decision]).request(
      "weather",
      { lat: 48.1, lon: 11.5 },
      {
        public: { capability: "weather", provider: "open-meteo", request },
        custom: () => ({ capability: "weather", provider: "broken-provider", request }),
      },
    );

    expect(result).toMatchObject({
      status: "disabled",
      resolution: { reason: "invalid-configuration" },
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("surfaces an upstream provider failure without changing provider policy", async () => {
    const fetcher = vi.fn(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
    const provider = activePublic("elevation");

    await expect(
      fetchElevations(provider, [{ id: 1, lat: 48.1, lon: 11.5 }], fetcher),
    ).rejects.toThrow("open-meteo elevation: HTTP 503");
    expect(provider.status).toBe("active");
  });
});
