import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const entry = 'stream_data[]: "http://radio-max-audio.kylescudder.co.uk/radio/main|RadioMax|Gaming Music|EN|128|1"';

test.beforeEach(async ({ request }) => {
  const token = await readFile('.artifacts/companion-merge/control-token', 'utf8');
  await request.get('http://127.0.0.1:8299/test-mode?mode=live', { headers: { authorization: `Bearer ${token}` } });
  // Allow the real server's deliberately bounded failure/success cache to expire.
  await expect.poll(async () => (await (await request.get('/api/radio/state')).json()).stations?.length).toBe(1);
});

test('public radio, exact ETS2 entry and responsive shared navigation', async ({ page, context }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/radio');
  await expect(page).toHaveTitle('RadioMax | Cabmate');
  await expect(page.getByRole('heading', { name: 'RadioMax', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'max verstappen' })).toBeVisible();
  await expect(page.getByText('3 drivers tuned in')).toBeVisible();
  await expect(page.getByLabel('ETS2 station entry')).toHaveText(entry);
  await page.getByRole('button', { name: 'Copy ETS2 entry' }).click();
  await expect(page.getByRole('status')).toHaveText('Copied. Ready for your next drive.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(entry);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Radio', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.artifacts/companion-merge/${testInfo.project.name}-radio.png`, fullPage: true });
  await page.reload();
  await expect(page.getByLabel('ETS2 station entry')).toHaveText(entry);
  expect(errors).toEqual([]);
});

test('station outage, retry recovery and empty state', async ({ page, request }, testInfo) => {
  const token = await readFile('.artifacts/companion-merge/control-token', 'utf8');
  await request.get('http://127.0.0.1:8299/test-mode?mode=down', { headers: { authorization: `Bearer ${token}` } });
  await page.goto('/radio');
  await expect(page.getByRole('heading', { name: 'RadioMax is taking a break.' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'max verstappen' })).toHaveCount(0);
  await page.screenshot({ path: `.artifacts/companion-merge/${testInfo.project.name}-radio-unavailable.png`, fullPage: true });
  await request.get('http://127.0.0.1:8299/test-mode?mode=live', { headers: { authorization: `Bearer ${token}` } });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'max verstappen' })).toBeVisible({ timeout: 15000 });
  await request.get('http://127.0.0.1:8299/test-mode?mode=empty', { headers: { authorization: `Bearer ${token}` } });
  await expect(page.getByText('No stations on air just yet. Check back shortly.')).toBeVisible({ timeout: 15000 });
});

test('driving routes and APIs remain protected, and both ingestion paths reject missing keys', async ({ page, request }, testInfo) => {
  for (const path of ['/', '/drivers', '/leaderboard', '/profile', '/u/example']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome to Cabmate' })).toBeVisible();
  }
  await page.screenshot({ path: `.artifacts/companion-merge/${testInfo.project.name}-login.png`, fullPage: true });
  for (const path of ['/api/drivers', '/api/profile', '/api/leaderboard', '/api/drivers/example']) {
    expect((await request.get(path)).status()).toBe(401);
  }
  for (const path of ['/api/ingest', '/functions/v1/ingest']) {
    expect((await request.post(path, { data: {} })).status()).toBe(401);
  }
  expect((await request.post('/api/radio/state', { data: {} })).status()).toBe(405);
});

test('clipboard denial gives a manual copy path', async ({ page }) => {
  await page.goto('/radio');
  // Browser permission boundary only, not the application/API response.
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', {
    value: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
  }));
  await page.getByRole('button', { name: 'Copy ETS2 entry' }).click();
  await expect(page.getByRole('status')).toHaveText('Couldn’t copy. Select the entry above and copy it manually.');
  await expect(page.getByLabel('ETS2 station entry')).toHaveText(entry);
});
