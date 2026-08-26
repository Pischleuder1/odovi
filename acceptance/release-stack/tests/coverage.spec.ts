import { expect, test } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { login, noteDeferredContract } from "./helpers";

test.beforeEach(async ({ context }) => {
  await installBrowserEgressGuard(context);
});

test("core archive remains usable while external providers are denied", async ({ page }, testInfo) => {
  await login(page);
  await page.goto(`/day/${process.env.ODOVI_ACCEPTANCE_DAY}`);
  await expect(page.locator("[data-testid=day-totals]")).toBeVisible();
  await expect(page.locator("[data-drive-classification]").first()).toBeVisible();

  if (process.env.ODOVI_EXPECT_PROVIDER_DISABLED_UI === "1") {
    await expect(page.locator("[data-testid=provider-disabled]").first()).toBeVisible();
  } else {
    noteDeferredContract(
      testInfo,
      "#32",
      "Network denial and core fallback are covered; Provider Review and the explicit disabled state follow in #32.",
    );
  }

  if (process.env.ODOVI_EXPECT_MAP_PROVIDER_POLICY !== "1") {
    noteDeferredContract(
      testInfo,
      "#33",
      "Map-specific disabled fallbacks and click-only external navigation remain bounded to #33.",
    );
  }
});

test("provider activation uses direct, touch-sized controls", async ({ page }) => {
  await login(page);
  await page.goto("/settings#provider-review");

  const card = page.locator("#provider-review article").first();
  await expect(card).toBeVisible();
  await expect(card.locator("select")).toHaveCount(0);

  const checkbox = card.getByRole("checkbox");
  const activationControl = card.getByTestId("provider-activation-control");
  const activationBox = await activationControl.boundingBox();
  expect(activationBox?.height).toBeGreaterThanOrEqual(44);

  await checkbox.check();
  const providerChoices = card.getByTestId("provider-choice");
  await expect(providerChoices).toHaveCount(2);
  for (const choice of await providerChoices.all()) {
    const choiceBox = await choice.boundingBox();
    expect(choiceBox?.height).toBeGreaterThanOrEqual(44);
  }

  await card.getByRole("radio", { name: /own provider|eigenen anbieter/i }).check();
  await expect(card.getByRole("textbox", { name: /provider name|anbietername/i })).toBeVisible();

  await checkbox.uncheck();
  await expect(providerChoices).toHaveCount(0);
});

test("manual language selection persists", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "DE", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");

  if (process.env.ODOVI_EXPECT_BROWSER_LOCALE === "1") {
    await page.context().clearCookies();
    await page.reload();
    const expected = testInfo.project.name === "mobile" ? "de" : "en";
    await expect(page.locator("html")).toHaveAttribute("lang", expected);
  } else {
    noteDeferredContract(
      testInfo,
      "#29",
      "Manual persistence is covered; browser-language detection and English fallback follow in #29.",
    );
  }
});

test("200 percent page scale keeps primary controls operable", async ({ page }) => {
  await login(page);
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await page.goto(`/day/${process.env.ODOVI_ACCEPTANCE_DAY}`);
  const firstClassification = page.locator("[data-drive-classification]").first();
  await expect(firstClassification).toBeVisible();
  await firstClassification.getByRole("button").first().focus();
  await expect(firstClassification.getByRole("button").first()).toBeFocused();
});

test("viewport permits user zoom", async ({ page }) => {
  await page.goto("/login");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/i);
  expect(viewport).not.toMatch(/maximum-scale\s*=\s*1/i);
});
