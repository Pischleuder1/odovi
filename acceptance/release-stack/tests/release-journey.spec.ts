import { expect, test } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { noteDeferredContract, password } from "./helpers";

test("fresh release journey: setup, sync, day, classification, export, version path, logout", async ({
  context,
  page,
}, testInfo) => {
  await installBrowserEgressGuard(context);

  await test.step("language selection and setup validation", async () => {
    await page.goto("/login");
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("First-time setup: set a password")).toBeVisible();

    const inputs = page.getByLabel(/Password|Repeat password/i);
    await inputs.nth(0).fill("too-short");
    await inputs.nth(1).fill("different-value");
    await page.getByRole("button", { name: "Set password" }).click();
    await expect(page.getByText("The passwords do not match.", { exact: true })).toBeVisible();

    const setupToken = process.env.ODOVI_ACCEPTANCE_SETUP_TOKEN;
    if (setupToken) {
      await page.getByLabel(/setup token/i).fill(setupToken);
    } else {
      noteDeferredContract(
        testInfo,
        "#27",
        "The harness is token-ready; the current app still uses the legacy first-visitor bootstrap.",
      );
    }

    await inputs.nth(0).fill(password);
    await inputs.nth(1).fill(password);
    await page.getByRole("button", { name: "Set password" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  await test.step("first synchronization and day view", async () => {
    const date = process.env.ODOVI_ACCEPTANCE_DAY;
    expect(date, "runner must provide a deterministic synchronized fixture day").toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    await page.goto(`/day/${date}`);
    await expect(page.locator("[data-testid=day-totals]")).toBeVisible();
    await expect(page.locator("[data-drive-classification]").first()).toBeVisible();
  });

  await test.step("keyboard classification", async () => {
    const group = page.locator("[data-drive-classification]").first();
    const business = group.getByRole("button", { name: /Business|Geschäftl/i });
    await business.focus();
    await expect(business).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(group).toHaveAttribute("data-drive-classification", "business");
  });

  await test.step("CSV export", async () => {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^odovi-tag-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(await download.createReadStream()).not.toBeNull();
  });

  await test.step("discoverable release identity path", async () => {
    await page.goto("/settings");
    if (process.env.ODOVI_EXPECT_RELEASE_IDENTITY === "1") {
      await expect(page.locator("[data-testid=release-identity]")).toContainText(
        process.env.ODOVI_ACCEPTANCE_VERSION!,
      );
    } else {
      noteDeferredContract(
        testInfo,
        "#28",
        "Settings is covered; visible semantic version and build identity are added by #28.",
      );
    }
  });

  await test.step("logout", async () => {
    await page.getByRole("button", { name: /Log out|Abmelden/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
