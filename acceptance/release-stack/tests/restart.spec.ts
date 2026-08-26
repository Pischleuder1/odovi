import { expect, test } from "@playwright/test";
import { installBrowserEgressGuard } from "../egress";
import { login } from "./helpers";

test("login and archive survive a web and worker restart", async ({ context, page }) => {
  await installBrowserEgressGuard(context);
  const response = await page.request.get(process.env.ODOVI_ACCEPTANCE_READINESS_URL!);
  expect(response.ok()).toBeTruthy();
  await login(page);
  await page.goto(`/day/${process.env.ODOVI_ACCEPTANCE_DAY}`);
  await expect(page.locator("[data-testid=day-totals]")).toBeVisible();
});
