import { describe, expect, it } from "vitest";
import { ODOVI_VERSION, resolveBuildInfo } from "./buildInfo.js";

describe("resolveBuildInfo", () => {
  it("uses a consistent source-development identity", () => {
    expect(resolveBuildInfo()).toEqual({
      version: ODOVI_VERSION,
      commit: "dev",
      identity: `Odovi ${ODOVI_VERSION} (dev)`,
    });
  });

  it("normalizes release metadata for display and support reports", () => {
    expect(
      resolveBuildInfo({
        ODOVI_VERSION: "0.2.0-rc.1",
        ODOVI_COMMIT_SHA: "75f5917e8750fac164a4239660354453b445ca64",
      }),
    ).toEqual({
      version: "0.2.0-rc.1",
      commit: "75f5917e8750",
      identity: "Odovi 0.2.0-rc.1 (75f5917e8750)",
    });
  });

  it("does not expose malformed injected metadata", () => {
    expect(
      resolveBuildInfo({
        ODOVI_VERSION: "not a version",
        ODOVI_COMMIT_SHA: "secret with spaces",
      }),
    ).toEqual({
      version: ODOVI_VERSION,
      commit: "dev",
      identity: `Odovi ${ODOVI_VERSION} (dev)`,
    });
  });
});
