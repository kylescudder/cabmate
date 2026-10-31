import { expect, test } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { mkdir } from 'node:fs/promises';

test('real Clerk session, protected pages, persisted profile and sign-out', async ({ page }) => {
  test.setTimeout(90_000);
  if (process.env.CLERK_TEST_DISPOSABLE_DATABASE !== 'true') {
    throw new Error('Confirm the local app uses disposable storage with CLERK_TEST_DISPOSABLE_DATABASE=true.');
  }
  const secretKey = process.env.CLERK_SECRET_KEY;
  const identifier = process.env.CLERK_TEST_IDENTIFIER;
  if (!secretKey?.startsWith('sk_test_') || !identifier?.includes('@')) {
    throw new Error('Supply development Clerk keys and the existing test account through the environment.');
  }
  await clerkSetup();
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in to Cabmate', exact: true })).toBeVisible();
  // Official helper obtains a real Clerk session for this existing dev user.
  // This bypasses the inbox/device challenge for automation, not app-side auth.
  try { await clerk.signIn({ page, emailAddress: identifier }); }
  catch { throw new Error('Clerk development test sign-in failed; credentials are omitted from this error.'); }
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Your cab', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch('/api/profile')).status)).toBe(200);

  // Changes go only to the caller's explicitly disposable local application DB,
  // never to Clerk user/account settings or the production application database.
  await page.getByLabel('Display name', { exact: true }).fill('Cabmate test driver');
  await page.getByLabel('Username', { exact: true }).fill('cabmate-test-driver');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Cabmate test driver');

  const live = page.waitForEvent('websocket', { predicate: socket => socket.url().endsWith('/ws') });
  await page.getByRole('navigation').getByRole('link', { name: 'Drivers', exact: true }).click();
  const socket = await live;
  const frame = await socket.waitForEvent('framereceived');
  expect(JSON.parse(String(frame.payload)).type).toBe('drivers');
  await expect(page.getByRole('heading', { name: "Who's on the road", exact: true })).toBeVisible();
  await expect(page.getByText('Cabmate test driver', { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch('/api/drivers')).status)).toBe(200);
  await mkdir('.artifacts/clerk-auth', { recursive: true });
  await page.screenshot({ path: '.artifacts/clerk-auth/authenticated-drivers.png', fullPage: true });

  await page.getByRole('navigation').getByRole('link', { name: 'Map', exact: true }).click();
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(async () => (await fetch('/api/profile')).status)).toBe(401);
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login$/);
});
