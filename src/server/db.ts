import 'server-only';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

let instance: Db | undefined;

/**
 * The database, connected on first use (so `next build` never needs one). A preview deployment
 * refuses to connect unless it's been given a database of its own: previews must never touch the
 * production data, even if the production settings were shared with them by mistake.
 */
export function db(): Db {
  if (instance) return instance;
  if (process.env['VERCEL_ENV'] === 'preview' && process.env['PREVIEW_HAS_OWN_DATABASE'] !== 'true') {
    throw new Error('This preview deployment has no database of its own.');
  }
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
  // On Vercel, closes idle connections before a function instance is suspended.
  attachDatabasePool(pool);
  instance = drizzle(pool, { schema, casing: 'snake_case' });
  return instance;
}

export const hasDatabase = () =>
  Boolean(process.env['DATABASE_URL']) && !(process.env['VERCEL_ENV'] === 'preview' && process.env['PREVIEW_HAS_OWN_DATABASE'] !== 'true');
