/**
 * Acceptance-only Node preload.
 *
 * Records every HTTP(S) fetch that leaves the disposable Compose network and
 * rejects it before DNS or a live third party can be contacted. Known hosts
 * are evidence of declared legacy behavior; any other host is undeclared and
 * makes the acceptance run fail in verify-egress.mjs.
 */
const { appendFileSync } = require("node:fs");

const logPath = process.env.ODOVI_ACCEPTANCE_EGRESS_LOG;
const declaredHosts = new Set(
  (process.env.ODOVI_ACCEPTANCE_EGRESS_ALLOWLIST || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const internalHosts = new Set(["localhost", "127.0.0.1", "::1", "web"]);
const originalFetch = globalThis.fetch;

if (logPath && typeof originalFetch === "function") {
  globalThis.fetch = async function acceptanceFetch(input, init) {
    const rawUrl =
      typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const url = new URL(rawUrl);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    const isInternal = internalHosts.has(url.hostname.toLowerCase());

    if (isHttp && !isInternal) {
      const entry = {
        source: "container-fetch",
        timestamp: new Date().toISOString(),
        method: init?.method || (typeof input === "object" && input.method) || "GET",
        host: url.hostname,
        pathname: url.pathname,
        declared: declaredHosts.has(url.hostname.toLowerCase()),
        outcome: "blocked",
      };
      appendFileSync(logPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
      throw new Error(
        `[acceptance-egress-guard] blocked ${entry.declared ? "declared" : "undeclared"} request to ${url.hostname}`,
      );
    }

    return originalFetch(input, init);
  };
}
