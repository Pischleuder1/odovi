import { appendFileSync } from "node:fs";
import type { BrowserContext, Request } from "@playwright/test";

const controlledHosts = new Set(
  (process.env.ODOVI_ACCEPTANCE_CONTROLLED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

function appendRequest(request: Request, controlled: boolean, outcome: "allowed" | "blocked") {
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
      search: url.search,
      controlled,
      outcome,
    })}\n`,
    "utf8",
  );
}

/** Blocks undeclared browser egress and locally fulfills controlled handoffs. */
export async function installBrowserEgressGuard(context: BrowserContext) {
  const appHost = new URL(process.env.ODOVI_ACCEPTANCE_BASE_URL!).hostname;
  await context.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const host = new URL(request.url()).hostname.toLowerCase();
    if (host === appHost || host === "127.0.0.1" || host === "localhost") {
      await route.continue();
      return;
    }
    if (controlledHosts.has(host)) {
      appendRequest(request, true, "allowed");
      await route.fulfill({ status: 204 });
      return;
    }

    appendRequest(request, false, "blocked");
    await route.abort("blockedbyclient");
  });
}
