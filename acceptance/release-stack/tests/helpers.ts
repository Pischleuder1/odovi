import { expect, type Page, type TestInfo } from "@playwright/test";

export const password = process.env.ODOVI_ACCEPTANCE_PASSWORD ?? "acceptance-only-42";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/Password|Passwort/i).first().fill(password);
  await page.getByRole("button", { name: /Sign in|Anmelden/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

export function noteDeferredContract(
  testInfo: TestInfo,
  issue: string,
  description: string,
) {
  testInfo.annotations.push({
    type: `dependency:${issue}`,
    description,
  });
}
