import { expect, test, type Page } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { login } from "./helpers";

const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X4hZ8QAAAABJRU5ErkJggg==",
  "base64",
);

async function providerCard(page: Page, capability: "mapTiles" | "externalNavigation") {
  await page.goto("/settings#provider-review");
  return page.locator(`article:has(input[name="capability"][value="${capability}"])`);
}

async function saveMode(
  page: Page,
  capability: "mapTiles" | "externalNavigation",
  mode: "public" | "custom",
) {
  const card = await providerCard(page, capability);
  const enabled = card.getByRole("checkbox");
  if (!(await enabled.isChecked())) await enabled.check();
  await card.locator(`input[type="radio"][value="${mode}"]`).check();
  return card;
}

test("map tiles and navigation cross the provider boundary only when activated", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one stateful provider-policy pass is sufficient");
  test.skip(
    process.env.ODOVI_EXPECT_MAP_PROVIDER_POLICY !== "1",
    "map provider contract is not enabled for this release",
  );
  await installBrowserEgressGuard(context);
  const requests: string[] = [];
  context.on("request", (request) => requests.push(request.url()));
  await login(page);

  await test.step("disabled maps preserve the archive without tile requests", async () => {
    await page.goto("/");
    await expect(page.locator("[data-testid=map-tiles-disabled]").first()).toBeVisible();
    expect(requests.some((url) => url.includes("tile.openstreetmap.org"))).toBe(false);
  });

  await test.step("public OSM loads interactively with linked attribution", async () => {
    const card = await saveMode(page, "mapTiles", "public");
    await card.getByRole("button", { name: /Save decision|Entscheidung speichern/i }).click();
    await expect(card.getByText(/Decision saved|Entscheidung gespeichert/i)).toBeVisible();

    await page.goto("/");
    const attribution = page.locator("[data-testid=map-provider-attribution]").first();
    await expect(attribution).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
    await expect
      .poll(() => requests.some((url) => url.includes("tile.openstreetmap.org")))
      .toBe(true);
  });

  await test.step("a custom tile endpoint needs no product-code change", async () => {
    const card = await saveMode(page, "mapTiles", "custom");
    await card.locator("input[name=providerName]").fill("Controlled tiles");
    await card
      .locator("input[name=endpoint]")
      .fill("https://controlled-tiles.invalid/{z}/{x}/{y}.png");
    await card
      .locator("input[name=customContactUrl]")
      .fill("https://controlled-tiles.invalid/policy");
    await card
      .locator("textarea[name=customOperatingLimits]")
      .fill("Acceptance endpoint only.");
    await card.getByRole("button", { name: /Save decision|Entscheidung speichern/i }).click();
    await expect(card.getByText(/Decision saved|Entscheidung gespeichert/i)).toBeVisible();

    let proxyRequests = 0;
    await page.route("**/api/location-providers/map-tiles/**", async (route) => {
      proxyRequests += 1;
      await route.fulfill({ status: 200, contentType: "image/png", body: transparentPng });
    });
    await page.goto("/");
    await expect(page.locator("[data-testid=map-provider-attribution]").first()).toContainText(
      "Controlled tiles",
    );
    await expect.poll(() => proxyRequests).toBeGreaterThan(0);
    expect(requests.some((url) => url.includes("controlled-tiles.invalid"))).toBe(false);
  });

  await test.step("Google receives the destination only after the navigation click", async () => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "odovi:offline-roadtrip:v1",
        JSON.stringify({
          journeyId: 1,
          journeyName: "Acceptance roadtrip",
          version: 1,
          savedAt: "2026-08-26T12:00:00.000Z",
          plan: {
            stops: [
              { id: "start", label: "Start", lat: 47.1, lon: 8.1, kind: "start" },
              { id: "finish", label: "Finish", lat: 47.2, lon: 8.2, kind: "destination" },
            ],
            legs: [
              {
                fromStopId: "start",
                toStopId: "finish",
                distanceKm: 12,
                durationSeconds: 900,
                arrivalSoc: 70,
              },
            ],
          },
        }),
      );
    });
    await page.goto("/roadtrip-offline");
    await expect(page.locator("[data-testid=external-navigation-disabled]")).toBeVisible();
    expect(requests.some((url) => url.includes("www.google.com/maps"))).toBe(false);

    const card = await saveMode(page, "externalNavigation", "public");
    await card.getByRole("button", { name: /Save decision|Entscheidung speichern/i }).click();
    await expect(card.getByText(/Decision saved|Entscheidung gespeichert/i)).toBeVisible();

    await page.goto("/roadtrip-offline");
    const navigate = page.locator("[data-testid=external-navigation]");
    await expect(navigate).toBeVisible();
    expect(requests.some((url) => url.includes("www.google.com/maps"))).toBe(false);
    await navigate.click();
    await expect
      .poll(() => requests.some((url) => url.includes("www.google.com/maps")))
      .toBe(true);
  });
});
