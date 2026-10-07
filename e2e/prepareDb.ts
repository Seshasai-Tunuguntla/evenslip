// Empties and migrates the end-to-end database before the app starts. Refuses any database whose
// name doesn't end in _e2e, so it can never wipe a real one.
import { Client } from 'pg';
import { runMigrations } from '../scripts/migrate.ts';

export const E2E_DATABASE_URL = process.env['E2E_DATABASE_URL'] ?? 'postgresql://localhost:5432/evenslip_e2e';

if (import.meta.main) {
  const name = new URL(E2E_DATABASE_URL).pathname.slice(1);
  if (!name.endsWith('_e2e')) throw new Error(`Refusing to empty "${name}": the e2e database's name must end in _e2e.`);
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await client.end();
  await runMigrations(E2E_DATABASE_URL);
}
