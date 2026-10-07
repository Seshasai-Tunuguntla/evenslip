import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema';

/** Creates or refreshes the user for a GitHub account and returns our own id for them. */
export async function upsertGithubUser(input: { githubId: string; name: string; image: string | null }): Promise<string> {
  const name = input.name.trim().slice(0, 40) || 'GitHub user';
  const [row] = await db()
    .insert(users)
    .values({ githubId: input.githubId, name, image: input.image })
    .onConflictDoUpdate({ target: users.githubId, set: { name: sql`excluded.name`, image: sql`excluded.image` } })
    .returning({ id: users.id });
  if (!row) throw new Error('upsertGithubUser: no row returned');
  return row.id;
}
