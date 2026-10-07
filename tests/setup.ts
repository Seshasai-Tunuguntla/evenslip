// Runs before each integration test file: points the app at the test database and replaces the two
// pieces of Next.js and Auth.js that need a real request (the session and cache revalidation).
import { vi } from 'vitest';
import { TEST_DATABASE_URL } from './globalSetup';

process.env['DATABASE_URL'] = TEST_DATABASE_URL;

vi.mock('@/auth', () => ({
  auth: vi.fn<() => Promise<unknown>>(async () => null),
  signIn: vi.fn<() => Promise<void>>(),
  signOut: vi.fn<() => Promise<void>>(),
  githubEnabled: false,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn<(path: string) => void>() }));
