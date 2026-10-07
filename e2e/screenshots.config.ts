import { defineConfig } from '@playwright/test';

// `npm run screenshots`: the README's pictures and the link-preview image, from the live site.
export default defineConfig({
  testDir: '.',
  testMatch: 'screenshots.capture.ts',
  workers: 1,
  reporter: 'list',
  outputDir: '../test-results',
  use: { baseURL: process.env['LIVE_URL'] ?? 'https://evenslip.vercel.app', locale: 'en-IN', timezoneId: 'Asia/Kolkata', deviceScaleFactor: 2 },
});
