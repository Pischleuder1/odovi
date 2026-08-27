import { describe, expect, it } from "vitest";
import { SETUP_TOKEN_MAX_AGE_MS, verifySetupToken } from "./setupToken";

const issuedAtSeconds = 1_800_000_000;
const nowMs = issuedAtSeconds * 1000 + 60_000;
const expected = `v1.${issuedAtSeconds}.${"a".repeat(64)}`;

describe("setup token verification", () => {
  it("accepts the exact configured token during its validity window", () => {
    expect(verifySetupToken(expected, expected, nowMs)).toBe(true);
  });

  it.each([
    ["missing configured token", undefined, expected],
    ["missing submitted token", expected, null],
    ["incorrect token", expected, `v1.${issuedAtSeconds}.${"b".repeat(64)}`],
    ["malformed token", expected, "not-a-token"],
  ])("rejects %s", (_label, configured, supplied) => {
    expect(verifySetupToken(configured, supplied, nowMs)).toBe(false);
  });

  it("rejects an expired token", () => {
    expect(
      verifySetupToken(expected, expected, issuedAtSeconds * 1000 + SETUP_TOKEN_MAX_AGE_MS + 1),
    ).toBe(false);
  });

  it("rejects a token issued implausibly far in the future", () => {
    expect(verifySetupToken(expected, expected, issuedAtSeconds * 1000 - 5 * 60_000 - 1)).toBe(
      false,
    );
  });
});
