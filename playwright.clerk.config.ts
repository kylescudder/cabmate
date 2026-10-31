import { defineConfig } from '@playwright/test';

// Opt-in real Clerk development-instance check. Keep credentials in environment;
// never enable traces/videos or automatic failure captures containing auth input.
const baseURL = process.env.CLERK_TEST_BASE_URL || 'http://localhost:3201';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('The Clerk smoke suite only runs against a loopback app with disposable storage.');
}
export default defineConfig({
  testDir: './tests/clerk', workers: 1, retries: 0,
  reporter: 'list',
  use: { baseURL,
    viewport: { width: 1280, height: 900 }, trace: 'off', video: 'off', screenshot: 'off' },
});
