/**
 * Whether this deployment may use a database. A preview needs one of its own
 * (PREVIEW_HAS_OWN_DATABASE=true), so it can never reach production's data.
 */
export const isPreviewWithoutOwnDatabase = () => process.env['VERCEL_ENV'] === 'preview' && process.env['PREVIEW_HAS_OWN_DATABASE'] !== 'true';

export const hasDatabase = () => Boolean(process.env['DATABASE_URL']) && !isPreviewWithoutOwnDatabase();
