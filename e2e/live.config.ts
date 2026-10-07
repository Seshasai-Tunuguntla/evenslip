import { defineConfig, devices } from '@playwright/test';

// Read-only checks against the live site: `LIVE_URL=https://evenslip.vercel.app npm run e2e:live`.
// It signs in to the shared demo but changes nothing, so visitors still find it as built.
export default defineConfig({
  testDir: '.',
  testMatch: 'live.check.ts',
  workers: 1,
  reporter: 'list',
  outputDir: '../test-results',
  use: { baseURL: process.env['LIVE_URL'] ?? 'https://evenslip.vercel.app', locale: 'en-IN', timezoneId: 'Asia/Kolkata' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
});
