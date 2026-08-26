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
      "#32/#33",
      "Network denial and core fallback are covered; the explicit disabled-provider UI follows in #32/#33.",
    );
  }
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
