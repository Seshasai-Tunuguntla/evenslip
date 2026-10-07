import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // `server-only` throws outside React's server build; in tests every module is server-side.
    alias: { '@': path('./src'), 'server-only': path('./tests/empty.ts') },
  },
  test: {
    passWithNoTests: true,
    projects: [
      // Pure functions: money, splits, settlement.
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      // Server Actions and queries against a real Postgres database (TEST_DATABASE_URL).
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/**/*.test.ts'],
          globalSetup: ['tests/globalSetup.ts'],
          setupFiles: ['tests/setup.ts'],
          testTimeout: 20_000,
        },
      },
    ],
  },
});
