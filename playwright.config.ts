import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', workers: 1, fullyParallel: false,
  reporter: [['list'], ['html', { outputFolder: '.artifacts/companion-merge/playwright-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3199', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'bun tests/e2e/start.ts', url: 'http://127.0.0.1:3199/healthz',
    reuseExistingServer: false, timeout: 60_000,
  },
});
