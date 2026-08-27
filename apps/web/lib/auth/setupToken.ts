import { createHash, timingSafeEqual } from "node:crypto";

export const SETUP_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SETUP_TOKEN_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const SETUP_TOKEN_PATTERN = /^v1\.(\d{10})\.([a-f0-9]{64})$/;

function parseIssuedAt(token: string): number | null {
  const match = SETUP_TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const issuedAtMs = Number(match[1]) * 1000;
  return Number.isSafeInteger(issuedAtMs) ? issuedAtMs : null;
}

export function setupTokenFingerprint(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Checks an opaque setup token without ever logging or returning either value.
 * The timestamp is embedded in the configured token, so operators only need
 * to manage one secret and stale bootstrap credentials expire automatically.
 */
export function verifySetupToken(
  expectedToken: string | undefined,
  suppliedToken: FormDataEntryValue | null,
  nowMs = Date.now(),
): boolean {
  const expected = expectedToken?.trim();
  if (!expected || typeof suppliedToken !== "string") return false;

  const issuedAtMs = parseIssuedAt(expected);
  if (issuedAtMs == null) return false;
  if (issuedAtMs > nowMs + SETUP_TOKEN_MAX_CLOCK_SKEW_MS) return false;
  if (nowMs - issuedAtMs > SETUP_TOKEN_MAX_AGE_MS) return false;

  const supplied = suppliedToken.trim();
  if (!SETUP_TOKEN_PATTERN.test(supplied)) return false;

  const expectedDigest = Buffer.from(setupTokenFingerprint(expected), "hex");
  const suppliedDigest = Buffer.from(setupTokenFingerprint(supplied), "hex");
  return timingSafeEqual(expectedDigest, suppliedDigest);
}
