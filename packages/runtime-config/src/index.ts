export type Environment = Record<string, string | undefined>;

const DEFAULT_TIMEZONE = "Europe/Zurich";
const DEFAULT_SYNC_INTERVAL_SECONDS = 60;
const DEFAULT_FLEET_API_URL = "https://fleet-api.prd.eu.vn.cloud.tesla.com";

export const RELEASE_SETTING_NAMES = [
  "POSTGRES_PASSWORD",
  "TESLAMATE_DATABASE_URL",
  "ODOVI_DB_USER",
  "ODOVI_DB_NAME",
  "ODOVI_DB_VOLUME_NAME",
  "WEB_PORT",
  "APP_TIMEZONE",
  "SYNC_INTERVAL_SECONDS",
  "INITIAL_ADMIN_PASSWORD",
  "OSRM_URL",
  "FORCE_SECURE_COOKIES",
  "ELEVATION_ENABLED",
  "ELEVATION_MAX_POINTS_PER_CYCLE",
  "TESLA_CLIENT_ID",
  "TESLA_CLIENT_SECRET",
  "TESLA_REDIRECT_URI",
  "TESLA_PARTNER_DOMAIN",
  "TESLA_TOKEN_ENCRYPTION_KEY",
  "TESLA_PUBLIC_KEY_PEM_BASE64",
  "TESLA_COMMAND_API_URL",
  "TESLA_COMMAND_PROXY_URL",
  "TESLA_FLEET_API_BASE_URL",
] as const;

export class RuntimeConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(scope: string, issues: string[]) {
    super(
      `[odovi-config] invalid ${scope} configuration:\n` +
        issues.map((issue) => `- ${issue}`).join("\n") +
        "\nSee docs/runtime-configuration.md for the supported release settings.",
    );
    this.name = "RuntimeConfigurationError";
    this.issues = issues;
  }
}

export interface TeslaProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  partnerDomain: string;
  encryptionKey: string;
  publicKeyPemBase64?: string;
  fleetApiBaseUrl: string;
  commandApiUrl: string;
}

export interface WebRuntimeConfig {
  databaseUrl: string;
  appTimezone: string;
  initialAdminPassword?: string;
  teslamateDatabaseUrl?: string;
  osrmUrl?: string;
  forceSecureCookies: boolean;
  tesla: TeslaProviderConfig | null;
}

export interface WorkerRuntimeConfig {
  databaseUrl: string;
  teslamateDatabaseUrl: string;
  appTimezone: string;
  syncIntervalSeconds: number;
  elevationEnabled: boolean;
  elevationMaxPointsPerCycle?: number;
}

export interface ReleaseRuntimeConfig {
  postgresPassword: string;
  databaseUser: string;
  databaseName: string;
  databaseVolumeName: string;
  webPort: number;
  web: Omit<WebRuntimeConfig, "databaseUrl">;
  worker: Omit<WorkerRuntimeConfig, "databaseUrl">;
}

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function required(env: Environment, name: string, issues: string[]): string {
  const value = present(env[name]);
  if (!value) {
    issues.push(`${name} is required and must not be empty`);
    return "";
  }
  return value;
}

function parseInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  issues: string[],
): number {
  if (present(value) == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    issues.push(`${name} must be an integer between ${min} and ${max}`);
    return fallback;
  }
  return parsed;
}

export function parseBooleanSetting(
  name: string,
  value: string | undefined,
  fallback: boolean,
): boolean {
  const normalized = present(value)?.toLowerCase();
  if (normalized == null) return fallback;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new RuntimeConfigurationError(name, [
    `${name} must be exactly true or false (received ${JSON.stringify(value)})`,
  ]);
}

function collectBoolean(
  name: string,
  value: string | undefined,
  fallback: boolean,
  issues: string[],
): boolean {
  try {
    return parseBooleanSetting(name, value, fallback);
  } catch (error) {
    if (error instanceof RuntimeConfigurationError) issues.push(...error.issues);
    else throw error;
    return fallback;
  }
}

function parseUrl(
  name: string,
  value: string | undefined,
  protocols: readonly string[],
  issues: string[],
): string | undefined {
  const configured = present(value);
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    if (!protocols.includes(url.protocol)) {
      issues.push(`${name} must use ${protocols.join(" or ")}`);
      return undefined;
    }
    if (url.username || url.password) {
      issues.push(`${name} must not contain credentials`);
      return undefined;
    }
    if (url.search || url.hash) {
      issues.push(`${name} must be a base URL without a query string or fragment`);
      return undefined;
    }
    return configured.replace(/\/+$/, "");
  } catch {
    issues.push(`${name} must be an absolute URL`);
    return undefined;
  }
}

function parseDatabaseUrl(
  name: string,
  value: string | undefined,
  requiredValue: boolean,
  issues: string[],
): string | undefined {
  const configured = present(value);
  if (!configured) {
    if (requiredValue) issues.push(`${name} is required and must not be empty`);
    return undefined;
  }
  try {
    const url = new URL(configured);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      issues.push(`${name} must use postgres:// or postgresql://`);
      return undefined;
    }
    if (!url.hostname || !url.pathname || url.pathname === "/") {
      issues.push(`${name} must include a host and database name`);
      return undefined;
    }
    return configured;
  } catch {
    issues.push(`${name} must be a valid PostgreSQL URL`);
    return undefined;
  }
}

export function parseAppTimezone(value: string | undefined): string {
  const timezone = present(value) ?? DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return timezone;
  } catch {
    throw new RuntimeConfigurationError("APP_TIMEZONE", [
      `APP_TIMEZONE must be a valid IANA time zone (received ${JSON.stringify(value)})`,
    ]);
  }
}

function collectTimezone(value: string | undefined, issues: string[]): string {
  try {
    return parseAppTimezone(value);
  } catch (error) {
    if (error instanceof RuntimeConfigurationError) issues.push(...error.issues);
    else throw error;
    return DEFAULT_TIMEZONE;
  }
}

function decodedBase64Bytes(value: string): number | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length * 3) / 4 - padding;
}

function decodedBase64Text(value: string): string | null {
  if (decodedBase64Bytes(value) == null) return null;
  try {
    return atob(value);
  } catch {
    return null;
  }
}

export function parseTeslaProviderConfig(
  env: Environment,
  collectedIssues?: string[],
): TeslaProviderConfig | null {
  const issues = collectedIssues ?? [];
  const requiredNames = [
    "TESLA_CLIENT_ID",
    "TESLA_CLIENT_SECRET",
    "TESLA_REDIRECT_URI",
    "TESLA_PARTNER_DOMAIN",
    "TESLA_TOKEN_ENCRYPTION_KEY",
  ] as const;
  const optionalNames = [
    "TESLA_PUBLIC_KEY_PEM_BASE64",
    "TESLA_COMMAND_API_URL",
    "TESLA_COMMAND_PROXY_URL",
    "TESLA_FLEET_API_BASE_URL",
  ] as const;
  const configured = [...requiredNames, ...optionalNames].filter((name) => present(env[name]));
  if (configured.length === 0) return null;

  const values = Object.fromEntries(
    requiredNames.map((name) => [name, required(env, name, issues)]),
  ) as Record<(typeof requiredNames)[number], string>;

  const redirectUri = parseUrl(
    "TESLA_REDIRECT_URI",
    values.TESLA_REDIRECT_URI,
    ["https:"],
    issues,
  );
  const fleetApiBaseUrl =
    parseUrl(
      "TESLA_FLEET_API_BASE_URL",
      env.TESLA_FLEET_API_BASE_URL ?? DEFAULT_FLEET_API_URL,
      ["https:"],
      issues,
    ) ?? DEFAULT_FLEET_API_URL;
  const commandApiUrl = parseUrl(
    "TESLA_COMMAND_API_URL",
    env.TESLA_COMMAND_API_URL,
    ["https:"],
    issues,
  );
  const legacyCommandApiUrl = parseUrl(
    "TESLA_COMMAND_PROXY_URL",
    env.TESLA_COMMAND_PROXY_URL,
    ["https:"],
    issues,
  );
  if (commandApiUrl && legacyCommandApiUrl && commandApiUrl !== legacyCommandApiUrl) {
    issues.push(
      "TESLA_COMMAND_API_URL and deprecated TESLA_COMMAND_PROXY_URL contradict each other; set only TESLA_COMMAND_API_URL",
    );
  }
  if (!/^[A-Za-z0-9.-]+$/.test(values.TESLA_PARTNER_DOMAIN)) {
    issues.push("TESLA_PARTNER_DOMAIN must be a hostname without a scheme or path");
  }
  if (decodedBase64Bytes(values.TESLA_TOKEN_ENCRYPTION_KEY) !== 32) {
    issues.push("TESLA_TOKEN_ENCRYPTION_KEY must be exactly 32 bytes encoded as base64");
  }
  const publicKeyPemBase64 = present(env.TESLA_PUBLIC_KEY_PEM_BASE64);
  if (publicKeyPemBase64) {
    const pem = decodedBase64Text(publicKeyPemBase64);
    if (!pem?.includes("BEGIN PUBLIC KEY") || !pem.includes("END PUBLIC KEY")) {
      issues.push("TESLA_PUBLIC_KEY_PEM_BASE64 must contain a base64-encoded public-key PEM");
    }
  }

  const config = {
    clientId: values.TESLA_CLIENT_ID,
    clientSecret: values.TESLA_CLIENT_SECRET,
    redirectUri: redirectUri ?? values.TESLA_REDIRECT_URI,
    partnerDomain: values.TESLA_PARTNER_DOMAIN,
    encryptionKey: values.TESLA_TOKEN_ENCRYPTION_KEY,
    publicKeyPemBase64,
    fleetApiBaseUrl,
    commandApiUrl: commandApiUrl ?? legacyCommandApiUrl ?? fleetApiBaseUrl,
  };
  if (collectedIssues == null && issues.length > 0) {
    throw new RuntimeConfigurationError("Tesla provider", issues);
  }
  return config;
}

export function parseRoutingUrl(value: string | undefined): string | undefined {
  const issues: string[] = [];
  const url = parseUrl("OSRM_URL", value, ["http:", "https:"], issues);
  if (issues.length > 0) throw new RuntimeConfigurationError("OSRM_URL", issues);
  return url;
}

export function parseWebRuntimeConfig(env: Environment): WebRuntimeConfig {
  const issues: string[] = [];
  const databaseUrl = parseDatabaseUrl("DATABASE_URL", env.DATABASE_URL, true, issues) ?? "";
  const teslamateDatabaseUrl = parseDatabaseUrl(
    "TESLAMATE_DATABASE_URL",
    env.TESLAMATE_DATABASE_URL,
    false,
    issues,
  );
  const appTimezone = collectTimezone(env.APP_TIMEZONE, issues);
  const osrmUrl = parseUrl("OSRM_URL", env.OSRM_URL, ["http:", "https:"], issues);
  const forceSecureCookies = collectBoolean(
    "FORCE_SECURE_COOKIES",
    env.FORCE_SECURE_COOKIES,
    false,
    issues,
  );
  const tesla = parseTeslaProviderConfig(env, issues);
  if (issues.length > 0) throw new RuntimeConfigurationError("web runtime", issues);
  return {
    databaseUrl,
    appTimezone,
    initialAdminPassword: present(env.INITIAL_ADMIN_PASSWORD),
    teslamateDatabaseUrl,
    osrmUrl,
    forceSecureCookies,
    tesla,
  };
}

export function parseWorkerRuntimeConfig(env: Environment): WorkerRuntimeConfig {
  const issues: string[] = [];
  const databaseUrl = parseDatabaseUrl("DATABASE_URL", env.DATABASE_URL, true, issues) ?? "";
  const teslamateDatabaseUrl =
    parseDatabaseUrl("TESLAMATE_DATABASE_URL", env.TESLAMATE_DATABASE_URL, true, issues) ?? "";
  const appTimezone = collectTimezone(env.APP_TIMEZONE, issues);
  const syncIntervalSeconds = parseInteger(
    "SYNC_INTERVAL_SECONDS",
    env.SYNC_INTERVAL_SECONDS,
    DEFAULT_SYNC_INTERVAL_SECONDS,
    5,
    86400,
    issues,
  );
  const elevationEnabled = collectBoolean(
    "ELEVATION_ENABLED",
    env.ELEVATION_ENABLED,
    true,
    issues,
  );
  const elevationMaxPointsPerCycle = present(env.ELEVATION_MAX_POINTS_PER_CYCLE)
    ? parseInteger(
        "ELEVATION_MAX_POINTS_PER_CYCLE",
        env.ELEVATION_MAX_POINTS_PER_CYCLE,
        500,
        1,
        10000,
        issues,
      )
    : undefined;
  if (!elevationEnabled && elevationMaxPointsPerCycle != null) {
    issues.push(
      "ELEVATION_MAX_POINTS_PER_CYCLE has no effect when ELEVATION_ENABLED=false; remove it or enable elevation",
    );
  }
  if (issues.length > 0) throw new RuntimeConfigurationError("worker runtime", issues);
  return {
    databaseUrl,
    teslamateDatabaseUrl,
    appTimezone,
    syncIntervalSeconds,
    elevationEnabled,
    elevationMaxPointsPerCycle,
  };
}

export function parseMigrationRuntimeConfig(env: Environment): { databaseUrl: string } {
  const issues: string[] = [];
  const databaseUrl = parseDatabaseUrl("DATABASE_URL", env.DATABASE_URL, true, issues) ?? "";
  if (issues.length > 0) throw new RuntimeConfigurationError("migration runtime", issues);
  return { databaseUrl };
}

function parseIdentifier(name: string, value: string, issues: string[]): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    issues.push(`${name} must be a PostgreSQL identifier (letters, digits and underscores)`);
  }
  return value;
}

export function parseReleaseRuntimeConfig(env: Environment): ReleaseRuntimeConfig {
  const issues: string[] = [];
  const postgresPassword = required(env, "POSTGRES_PASSWORD", issues);
  if (postgresPassword && !/^[A-Za-z0-9._~-]+$/.test(postgresPassword)) {
    issues.push(
      "POSTGRES_PASSWORD must be URL-safe because Compose embeds it in DATABASE_URL; use letters, digits, '.', '_', '~' or '-'",
    );
  }
  const databaseUser = parseIdentifier("ODOVI_DB_USER", present(env.ODOVI_DB_USER) ?? "odovi", issues);
  const databaseName = parseIdentifier("ODOVI_DB_NAME", present(env.ODOVI_DB_NAME) ?? "odovi", issues);
  const databaseVolumeName = present(env.ODOVI_DB_VOLUME_NAME) ?? "odovi-db-data";
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]+$/.test(databaseVolumeName)) {
    issues.push("ODOVI_DB_VOLUME_NAME must be a valid Docker volume name");
  }
  const webPort = parseInteger("WEB_PORT", env.WEB_PORT, 3000, 1, 65535, issues);
  const teslamateDatabaseUrl =
    parseDatabaseUrl("TESLAMATE_DATABASE_URL", env.TESLAMATE_DATABASE_URL, true, issues) ?? "";
  const appTimezone = collectTimezone(env.APP_TIMEZONE, issues);
  const syncIntervalSeconds = parseInteger(
    "SYNC_INTERVAL_SECONDS",
    env.SYNC_INTERVAL_SECONDS,
    DEFAULT_SYNC_INTERVAL_SECONDS,
    5,
    86400,
    issues,
  );
  const osrmUrl = parseUrl("OSRM_URL", env.OSRM_URL, ["http:", "https:"], issues);
  const forceSecureCookies = collectBoolean(
    "FORCE_SECURE_COOKIES",
    env.FORCE_SECURE_COOKIES,
    false,
    issues,
  );
  const elevationEnabled = collectBoolean(
    "ELEVATION_ENABLED",
    env.ELEVATION_ENABLED,
    true,
    issues,
  );
  const elevationMaxPointsPerCycle = present(env.ELEVATION_MAX_POINTS_PER_CYCLE)
    ? parseInteger(
        "ELEVATION_MAX_POINTS_PER_CYCLE",
        env.ELEVATION_MAX_POINTS_PER_CYCLE,
        500,
        1,
        10000,
        issues,
      )
    : undefined;
  if (!elevationEnabled && elevationMaxPointsPerCycle != null) {
    issues.push(
      "ELEVATION_MAX_POINTS_PER_CYCLE has no effect when ELEVATION_ENABLED=false; remove it or enable elevation",
    );
  }
  const tesla = parseTeslaProviderConfig(env, issues);
  if (issues.length > 0) throw new RuntimeConfigurationError("release", issues);
  return {
    postgresPassword,
    databaseUser,
    databaseName,
    databaseVolumeName,
    webPort,
    web: {
      appTimezone,
      initialAdminPassword: present(env.INITIAL_ADMIN_PASSWORD),
      teslamateDatabaseUrl,
      osrmUrl,
      forceSecureCookies,
      tesla,
    },
    worker: {
      teslamateDatabaseUrl,
      appTimezone,
      syncIntervalSeconds,
      elevationEnabled,
      elevationMaxPointsPerCycle,
    },
  };
}

const IGNORED_RUNTIME_KEYS = new Set([
  "HOME",
  "HOSTNAME",
  "NODE_ENV",
  "NODE_VERSION",
  "PATH",
  "PWD",
  "SHLVL",
  "TERM",
  "YARN_VERSION",
]);

export function unknownReleaseSettings(env: Environment): string[] {
  const known = new Set<string>(RELEASE_SETTING_NAMES);
  return Object.keys(env)
    .filter((name) => {
      if (known.has(name) || IGNORED_RUNTIME_KEYS.has(name)) return false;
      if (name.startsWith("COMPOSE_") || name.startsWith("DOCKER_")) return false;
      if (name.startsWith("npm_") || name.startsWith("PNPM_")) return false;
      return /^[A-Z][A-Z0-9_]+$/.test(name);
    })
    .sort();
}
