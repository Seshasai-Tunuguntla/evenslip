// The checks every Server Action and page starts with. Signed out: back to the start page.
// Not a member of the group (or the group doesn't exist, or the id isn't a UUID): 404, the same
// answer either way, so a group's existence never leaks.
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from './db';
import { groups, members, users } from './schema';

export type CurrentUser = { id: string; name: string; isDemo: boolean };
export type MemberContext = { user: CurrentUser; memberId: string; group: { id: string; name: string; isDemo: boolean } };

const uuid = z.uuid();
export const isUuid = (value: unknown): value is string => uuid.safeParse(value).success;

/** The signed-in user, or null. A session for a user that no longer exists counts as signed out. */
export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!isUuid(id)) return null;
  const [user] = await db().select({ id: users.id, name: users.name, isDemo: users.isDemo }).from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect('/');
  return user;
}

export async function requireMember(groupId: unknown): Promise<MemberContext> {
  const user = await requireUser();
  if (!isUuid(groupId)) notFound();
  const [row] = await db()
    .select({ memberId: members.id, id: groups.id, name: groups.name, isDemo: groups.isDemo })
    .from(members)
    .innerJoin(groups, eq(groups.id, members.groupId))
    .where(and(eq(members.groupId, groupId), eq(members.userId, user.id)));
  if (!row) notFound();
  return { user, memberId: row.memberId, group: { id: row.id, name: row.name, isDemo: row.isDemo } };
}
