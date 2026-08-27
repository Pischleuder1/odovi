import { describe, expect, it } from "vitest";
import {
  classifyReadiness,
  diagnosticErrorCode,
  type ReadinessReport,
} from "./readiness-model";

const healthyChecks = (): ReadinessReport["checks"] => ({
  database: { state: "healthy", code: "reachable" },
  migrations: { state: "healthy", code: "current" },
  protectedApplication: { state: "healthy", code: "servable" },
  worker: { state: "healthy", code: "fresh" },
  teslamate: { state: "healthy", code: "compatible" },
  optionalProviders: { state: "healthy", code: "available_or_disabled" },
});

describe("readiness classification", () => {
  it.each(["database", "migrations", "protectedApplication"] as const)(
    "is not ready when %s fails",
    (name) => {
      const checks = healthyChecks();
      checks[name] = { state: "failed", code: "failed" };
      expect(classifyReadiness(checks)).toBe("not_ready");
    },
  );

  it.each(["worker", "teslamate", "optionalProviders"] as const)(
    "is degraded, but ready, when %s is unavailable",
    (name) => {
      const checks = healthyChecks();
      checks[name] = { state: "degraded", code: "unavailable" };
      expect(classifyReadiness(checks)).toBe("degraded");
    },
  );

  it("is healthy when required services and operational dependencies are healthy", () => {
    expect(classifyReadiness(healthyChecks())).toBe("healthy");
  });
});

describe("diagnostic error codes", () => {
  it("does not expose a connection string or password", () => {
    const error = new Error(
      "password authentication failed for postgres://admin:very-secret@db/odovi",
    );
    expect(diagnosticErrorCode(error)).toBe("authentication_failed");
  });
});
