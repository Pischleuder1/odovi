import { appendFileSync } from "node:fs";
import type { BrowserContext, Request } from "@playwright/test";

const declaredHosts = new Set(
  (process.env.ODOVI_ACCEPTANCE_EGRESS_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

function appendRequest(request: Request, declared: boolean) {
  const logPath = process.env.ODOVI_ACCEPTANCE_BROWSER_EGRESS_LOG;
  if (!logPath) return;
  const url = new URL(request.url());
  appendFileSync(
    logPath,
    `${JSON.stringify({
      source: "browser",
      timestamp: new Date().toISOString(),
      method: request.method(),
      host: url.hostname,
      pathname: url.pathname,
      declared,
      outcome: "blocked",
    })}\n`,
    "utf8",
  );
}

/** Blocks all browser egress outside the acceptance app and records the intent. */
export async function installBrowserEgressGuard(context: BrowserContext) {
  const appHost = new URL(process.env.ODOVI_ACCEPTANCE_BASE_URL!).hostname;
  await context.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const host = new URL(request.url()).hostname.toLowerCase();
    if (host === appHost || host === "127.0.0.1" || host === "localhost") {
      await route.continue();
      return;
    }

    appendRequest(request, declaredHosts.has(host));
    await route.abort("blockedbyclient");
  });
}
