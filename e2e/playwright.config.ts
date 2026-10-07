import { defineConfig, devices } from '@playwright/test';
import { E2E_DATABASE_URL } from './prepareDb.ts';

// The end-to-end test runs the production build against its own Postgres database, on a port of its
// own so it never meets the dev server.
export const PORT = 3300;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  // One shared demo: run the tests one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  use: { baseURL: `http://localhost:${PORT}`, locale: 'en-IN', timezoneId: 'Asia/Kolkata', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `node e2e/prepareDb.ts && npx next build && npx next start --port ${PORT}`,
    cwd: '..',
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      // A fixed value for this local test server only; production's secret is generated separately.
      AUTH_SECRET: 'e2e-only-not-a-real-secret-0123456789abcdef',
      AUTH_TRUST_HOST: 'true',
      AUTH_GITHUB_ID: '',
      AUTH_GITHUB_SECRET: '',
    },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
