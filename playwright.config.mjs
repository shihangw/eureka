import { defineConfig } from '@playwright/test';

// The fixture server port is shared, so browser tests run one at a time.
export default defineConfig({
  testDir: 'test/browser',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  projects: [{ name: 'integration', testMatch: 'integration/**/*.spec.mjs' }],
  webServer: {
    command: 'node test/browser/server.mjs --host=127.0.0.1 --port=4310',
    url: 'http://127.0.0.1:4310/health',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
