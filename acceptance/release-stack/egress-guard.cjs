/** Acceptance-only, default-deny HTTP(S) preload for web and worker. */
const { appendFileSync } = require("node:fs");
const http = require("node:http");
const https = require("node:https");

const logPath = process.env.ODOVI_ACCEPTANCE_EGRESS_LOG;
const controlledHosts = new Set(
  (process.env.ODOVI_ACCEPTANCE_CONTROLLED_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const internalHosts = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "web",
  "db",
  "teslamate-db",
]);

function record(url, method, controlled, outcome, source) {
  if (!logPath) return;
  appendFileSync(
    logPath,
    `${JSON.stringify({
      source,
      timestamp: new Date().toISOString(),
      method,
      host: url.hostname,
      pathname: url.pathname,
      controlled,
      outcome,
    })}\n`,
    { encoding: "utf8" },
  );
}

function disposition(url, method, source) {
  const host = url.hostname.toLowerCase();
  if (internalHosts.has(host)) return "internal";
  if (controlledHosts.has(host)) {
    record(url, method, true, "allowed", source);
    return "controlled";
  }
  record(url, method, false, "blocked", source);
  throw new Error(`[acceptance-egress-guard] blocked undeclared request to ${url.hostname}`);
}

const originalFetch = globalThis.fetch;
if (logPath && typeof originalFetch === "function") {
  globalThis.fetch = async function acceptanceFetch(input, init) {
    const rawUrl =
      typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const url = new URL(rawUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      disposition(
        url,
        init?.method || (typeof input === "object" && input.method) || "GET",
        "container-fetch",
      );
    }
    return originalFetch(input, init);
  };
}

function requestUrl(defaultProtocol, args) {
  const first = args[0];
  if (typeof first === "string" || first instanceof URL) return new URL(String(first));
  const options = first || {};
  const protocol = options.protocol || defaultProtocol;
  const hostname = options.hostname || options.host || "localhost";
  const port = options.port ? `:${options.port}` : "";
  return new URL(`${protocol}//${hostname}${port}${options.path || "/"}`);
}

function guardRequests(module, protocol) {
  const originalRequest = module.request;
  module.request = function acceptanceRequest(...args) {
    const url = requestUrl(protocol, args);
    const options =
      typeof args[0] === "object" && !(args[0] instanceof URL) ? args[0] : args[1];
    disposition(url, options?.method || "GET", "container-http");
    return originalRequest.apply(this, args);
  };
  module.get = function acceptanceGet(...args) {
    const request = module.request(...args);
    request.end();
    return request;
  };
}

if (logPath) {
  guardRequests(http, "http:");
  guardRequests(https, "https:");
}
