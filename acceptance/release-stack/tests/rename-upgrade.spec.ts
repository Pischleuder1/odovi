import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installBrowserEgressGuard } from '../egress';

const stage = process.env.ODOVI_UPGRADE_STAGE;
const evidence = process.env.ODOVI_ACCEPTANCE_EVIDENCE_DIR!;
test.skip(!stage, 'Only run through rename-upgrade-acceptance.mjs');

test('supported rename upgrade preserves login, archive, exports and mandatory provider review', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US',
    ...(stage !== 'legacy' ? { storageState: join(evidence, 'legacy-session.json') } : {}) });
  await installBrowserEgressGuard(context);
  const page = await context.newPage();
  const base = process.env.ODOVI_ACCEPTANCE_BASE_URL!;
  if (stage === 'legacy') {
    await page.goto(`${base}/login`);
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.locator('input[name="password"]').fill('Synthetic-upgrade-password-2026');
    await page.locator('button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/login$/);
    await context.storageState({ path: join(evidence, 'legacy-session.json') });
    expect((await context.cookies()).some(c => c.name === 'tripatlas_session')).toBe(true);
  }
  await page.goto(`${base}/drives/1`);
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(page.locator('textarea[name="notes"]')).toHaveValue('Upgrade annotation — preserve me');
  await page.goto(`${base}/journeys/1`);
  await expect(page.getByRole('heading', { name: 'Upgrade journey', exact: true })).toBeVisible();
  for (const [name, url] of [
    ['day.csv', '/api/export/day/2026-07-07?format=csv'],
    ['journey.csv', '/api/export/journey/1?format=csv'],
    ['journey.gpx', '/api/export/journey/1?format=gpx'],
  ]) {
    const response = await context.request.get(`${base}${url}`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    // Branding changes only the GPX creator / attachment filename, not user data.
    const comparable = body.replaceAll('Tripatlas','Odovi').replaceAll('tripatlas','odovi');
    if (stage === 'legacy') writeFileSync(join(evidence, name), comparable);
    else expect(comparable).toBe(readFileSync(join(evidence, name), 'utf8'));
  }
  if (stage === 'upgraded' || stage === 'restored') {
    await page.goto(`${base}/settings`);
    const identity = page.locator('[data-testid="release-identity"]');
    await expect(identity).toContainText(process.env.ODOVI_ACCEPTANCE_VERSION!);
    await expect(identity).toContainText(process.env.ODOVI_ACCEPTANCE_GIT_COMMIT!.slice(0,7));
    const review = page.locator('#provider-review');
    if (stage === 'upgraded') {
      await expect(page.getByText('Location Provider Review required', { exact: true })).toBeVisible();
      await expect(review.locator('input[type="checkbox"]')).toHaveCount(6);
      for (const checkbox of await review.locator('input[type="checkbox"]').all()) await expect(checkbox).not.toBeChecked();
      for (const article of await review.locator('article').all()) {
        await article.getByRole('button', { name: 'Save decision', exact: true }).click();
        await expect(article.getByText('Decision saved', { exact: true })).toBeVisible();
      }
      await expect(page.getByText('Location Provider Review required', { exact: true })).toHaveCount(0);
    }
    for (const checkbox of await review.locator('input[type="checkbox"]').all()) await expect(checkbox).not.toBeChecked();
    await expect(review.getByText('Disabled', { exact: true })).toHaveCount(6);
  }
  if (stage === 'restored') {
    // Recovery must retain usable password hashes, not merely copy their bytes.
    const other = await browser.newContext({ locale: 'en-US' });
    await installBrowserEgressGuard(other);
    const otherPage = await other.newPage();
    await otherPage.goto(`${base}/login`);
    await otherPage.locator('input[name="password"]').fill('Synthetic-upgrade-password-2026');
    await otherPage.locator('button[type="submit"]').click();
    await expect(otherPage).not.toHaveURL(/\/login$/);
    await page.locator('input[name="currentPassword"]').fill('Synthetic-upgrade-password-2026');
    await page.locator('input[name="newPassword"]').fill('Synthetic-new-upgrade-password-2026');
    await page.locator('input[name="newPasswordRepeat"]').fill('Synthetic-new-upgrade-password-2026');
    await page.getByRole('button',{name:'Change password',exact:true}).click();
    await expect(page.getByText('Password changed. Other signed-in sessions were logged out.',{exact:true})).toBeVisible();
    await page.reload();
    await expect(page).not.toHaveURL(/\/login$/); // Current legacy session is retained.
    await otherPage.goto(`${base}/settings`);
    await expect(otherPage).toHaveURL(/\/login$/);
    await other.close();
  }
  await context.close();
});
