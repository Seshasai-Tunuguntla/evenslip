// Empties and migrates the test database once before the integration tests. Refuses any database
// whose name doesn't end in _test, so it can never wipe a real one.
import { Client } from 'pg';
import { runMigrations } from '../scripts/migrate.ts';

export const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'] ?? 'postgresql://localhost:5432/evenslip_test';

export default async function setup() {
  const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!name.endsWith('_test')) throw new Error(`Refusing to empty "${name}": the test database's name must end in _test.`);
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await client.end();
  await runMigrations(TEST_DATABASE_URL);
}
