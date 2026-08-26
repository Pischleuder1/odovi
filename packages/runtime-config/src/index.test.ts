import { describe, expect, it } from "vitest";
import {
  parseReleaseRuntimeConfig,
  parseWebRuntimeConfig,
  parseWorkerRuntimeConfig,
  RuntimeConfigurationError,
  unknownReleaseSettings,
} from "./index.js";

const REQUIRED = {
  POSTGRES_PASSWORD: "release-secret_123",
  TESLAMATE_DATABASE_URL: "postgres://odovi_ro:secret@teslamate:5432/teslamate",
};

describe("release configuration", () => {
  it("accepts required-only settings with documented defaults", () => {
    const config = parseReleaseRuntimeConfig(REQUIRED);
    expect(config.web.appTimezone).toBe("Europe/Zurich");
    expect(config.web.forceSecureCookies).toBe(false);
    expect(config.worker.syncIntervalSeconds).toBe(60);
    expect(config.worker.elevationEnabled).toBe(true);
  });

  it("accepts and routes every optional setting", () => {
    const config = parseReleaseRuntimeConfig({
      ...REQUIRED,
      APP_TIMEZONE: "America/New_York",
      WEB_PORT: "8443",
      SYNC_INTERVAL_SECONDS: "120",
      ODOVI_SETUP_TOKEN: `v1.1800000000.${"a".repeat(64)}`,
      OSRM_URL: "http://router.internal:5000/",
      FORCE_SECURE_COOKIES: "true",
      ELEVATION_ENABLED: "true",
      ELEVATION_MAX_POINTS_PER_CYCLE: "250",
      TESLA_CLIENT_ID: "client",
      TESLA_CLIENT_SECRET: "secret",
      TESLA_REDIRECT_URI: "https://odovi.example/api/tesla/callback",
      TESLA_PARTNER_DOMAIN: "odovi.example",
      TESLA_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      TESLA_PUBLIC_KEY_PEM_BASE64:
        "LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KdGVzdAotLS0tLUVORCBQVUJMSUMgS0VZLS0tLS0K",
      TESLA_COMMAND_API_URL: "https://commands.example/",
    });
    expect(config.web.osrmUrl).toBe("http://router.internal:5000");
    expect(config.web.forceSecureCookies).toBe(true);
    expect(config.web.setupToken).toMatch(/^v1\./);
    expect(config.web.tesla?.commandApiUrl).toBe("https://commands.example");
    expect(config.worker.appTimezone).toBe("America/New_York");
    expect(config.worker.elevationMaxPointsPerCycle).toBe(250);
  });

  it("rejects invalid, contradictory and unsafe settings together", () => {
    expect(() =>
      parseReleaseRuntimeConfig({
        ...REQUIRED,
        POSTGRES_PASSWORD: "unsafe/password",
        APP_TIMEZONE: "Moon/Base",
        FORCE_SECURE_COOKIES: "yes",
        ELEVATION_ENABLED: "false",
        ELEVATION_MAX_POINTS_PER_CYCLE: "100",
      }),
    ).toThrowError(RuntimeConfigurationError);
    try {
      parseReleaseRuntimeConfig({
        ...REQUIRED,
        POSTGRES_PASSWORD: "unsafe/password",
        APP_TIMEZONE: "Moon/Base",
        FORCE_SECURE_COOKIES: "yes",
        ELEVATION_ENABLED: "false",
        ELEVATION_MAX_POINTS_PER_CYCLE: "100",
      });
    } catch (error) {
      expect(String(error)).toContain("POSTGRES_PASSWORD must be URL-safe");
      expect(String(error)).toContain("valid IANA time zone");
      expect(String(error)).toContain("must be exactly true or false");
      expect(String(error)).toContain("has no effect");
    }
  });

  it("rejects partial Tesla provider activation", () => {
    expect(() =>
      parseReleaseRuntimeConfig({ ...REQUIRED, TESLA_CLIENT_ID: "only-one-setting" }),
    ).toThrow(/TESLA_CLIENT_SECRET is required/);
  });

  it("rejects a hand-written setup token", () => {
    expect(() =>
      parseReleaseRuntimeConfig({ ...REQUIRED, ODOVI_SETUP_TOKEN: "guessable" }),
    ).toThrow(/pnpm setup-token/);
  });

  it("rejects a malformed Tesla public key before web startup", () => {
    expect(() =>
      parseReleaseRuntimeConfig({
        ...REQUIRED,
        TESLA_CLIENT_ID: "client",
        TESLA_CLIENT_SECRET: "secret",
        TESLA_REDIRECT_URI: "https://odovi.example/api/tesla/callback",
        TESLA_PARTNER_DOMAIN: "odovi.example",
        TESLA_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        TESLA_PUBLIC_KEY_PEM_BASE64: "bm90LWEtcGVt",
      }),
    ).toThrow(/base64-encoded public-key PEM/);
  });

  it("diagnoses unknown and development-only settings", () => {
    expect(
      unknownReleaseSettings({
        ...REQUIRED,
        DATABASE_URL: "postgres://dev",
        ODOVI_VERSION: "0.2.0-rc.1",
        ODOVI_COMMIT_SHA: "75f5917e8750",
      }),
    ).toEqual(["DATABASE_URL"]);
  });
});

describe("process runtime contracts", () => {
  it("requires both worker database URLs before the sync loop", () => {
    expect(() => parseWorkerRuntimeConfig({ DATABASE_URL: REQUIRED.TESLAMATE_DATABASE_URL })).toThrow(
      /TESLAMATE_DATABASE_URL is required/,
    );
  });

  it("accepts an optional TeslaMate diagnostic URL in web", () => {
    const config = parseWebRuntimeConfig({
      DATABASE_URL: "postgres://odovi:secret@db:5432/odovi",
      TESLAMATE_DATABASE_URL: REQUIRED.TESLAMATE_DATABASE_URL,
    });
    expect(config.teslamateDatabaseUrl).toBe(REQUIRED.TESLAMATE_DATABASE_URL);
  });
});
