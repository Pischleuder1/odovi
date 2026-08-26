import { describe, expect, it } from "vitest";
import { workerErrorCode } from "./operationalStatus.js";

describe("worker operational status", () => {
  it("classifies incompatible TeslaMate schemas", () => {
    expect(workerErrorCode(new Error("TeslaMate-Kompatibilitätsprüfung fehlgeschlagen"))).toBe(
      "incompatible_schema",
    );
  });

  it("never persists a database URL or password", () => {
    const error = new Error("connect postgres://user:secret@teslamate/db ECONNREFUSED");
    expect(workerErrorCode(error)).toBe("connection_failed");
  });
});
