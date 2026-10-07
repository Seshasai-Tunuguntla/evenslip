// Runs once when a server instance starts: rebuilds the demo if it's 30+ minutes old, so the first
// visitor after a quiet spell finds it fresh. Never during `next build`, and never without a database.
export async function register() {
  if (process.env['NEXT_RUNTIME'] !== 'nodejs' || process.env['NEXT_PHASE'] === 'phase-production-build') return;
  const { hasDatabase } = await import('./server/env');
  if (!hasDatabase()) return;
  const { resetDemoIfStale } = await import('./server/demo');
  try {
    if (await resetDemoIfStale()) console.info('demo: rebuilt on cold start');
  } catch (error) {
    console.error('demo: cold-start rebuild failed', error);
  }
}
