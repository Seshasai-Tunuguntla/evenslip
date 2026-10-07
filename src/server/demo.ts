// The demo: one shared account, signed in with one click.
import 'server-only';
import { db } from './db';
import { users } from './schema';

export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
const DEMO_NAME = 'Asha';

/** Makes sure the demo account exists and returns it, for the demo provider's authorize(). */
export async function prepareDemoSignIn(): Promise<{ id: string; name: string }> {
  await db().insert(users).values({ id: DEMO_USER_ID, name: DEMO_NAME, isDemo: true }).onConflictDoNothing();
  return { id: DEMO_USER_ID, name: DEMO_NAME };
}
