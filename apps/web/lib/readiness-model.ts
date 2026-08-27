export type OperationalState = "healthy" | "degraded" | "not_ready";
export type CheckState = "healthy" | "degraded" | "failed" | "unknown";

export interface RequiredCheck {
  state: "healthy" | "failed";
  code: string;
}

export interface OperationalCheck {
  state: CheckState;
  code: string;
  lastSuccessAt?: string;
}

export interface ReadinessReport {
  status: OperationalState;
  checks: {
    database: RequiredCheck;
    migrations: RequiredCheck;
    protectedApplication: RequiredCheck;
    worker: OperationalCheck;
    teslamate: OperationalCheck;
    optionalProviders: OperationalCheck;
  };
}

const REQUIRED_CHECKS = ["database", "migrations", "protectedApplication"] as const;

/** Required failures make the product unavailable; operational failures degrade it. */
export function classifyReadiness(
  checks: ReadinessReport["checks"],
): OperationalState {
  if (REQUIRED_CHECKS.some((name) => checks[name].state === "failed")) {
    return "not_ready";
  }

  if (
    checks.worker.state !== "healthy" ||
    checks.teslamate.state !== "healthy" ||
    checks.optionalProviders.state === "degraded" ||
    checks.optionalProviders.state === "failed"
  ) {
    return "degraded";
  }

  return "healthy";
}

/**
 * Convert arbitrary runtime errors to stable operator codes. Error messages,
 * URLs and connection strings never cross the diagnostics boundary.
 */
export function diagnosticErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (message.includes("password authentication") || message.includes("authentication failed")) {
    return "authentication_failed";
  }
  if (message.includes("connect") || message.includes("econnrefused") || message.includes("enotfound")) {
    return "connection_failed";
  }
  if (message.includes("relation") && message.includes("does not exist")) {
    return "schema_incomplete";
  }
  return "unavailable";
}
