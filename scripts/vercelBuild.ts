// The Vercel build (`npm run vercel-build`): migrates the production database over Neon's direct
// connection, then builds the app. Previews never migrate anything unless they've been given a
// database of their own (PREVIEW_HAS_OWN_DATABASE=true); production refuses to build without one.
import { execFileSync } from 'node:child_process';
import { runMigrations } from './migrate.ts';

const env = process.env['VERCEL_ENV'];
const ownDatabase = env === 'production' || (env === 'preview' && process.env['PREVIEW_HAS_OWN_DATABASE'] === 'true');
if (ownDatabase) {
  // Migrations need a session, so the direct (unpooled) connection when Neon provides one.
  const url = process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error(`A ${env} build needs DATABASE_URL_UNPOOLED or DATABASE_URL.`);
  await runMigrations(url);
  console.info('vercelBuild: migrations applied');
} else {
  console.info(`vercelBuild: ${env ?? 'local'} build, no database migrated`);
}
execFileSync('npx', ['next', 'build'], { stdio: 'inherit' });
