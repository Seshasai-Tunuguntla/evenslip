// Applies the SQL migrations in drizzle/ (made by `npm run db:generate`). Used by the tests' setup,
// the end-to-end setup and the production build. `npm run db:migrate` migrates DATABASE_URL.
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set.');
  await runMigrations(url);
  console.info('migrations applied');
}
