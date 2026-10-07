import 'server-only';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from './db';
import { groups, invites, members } from './schema';
import { hashToken, isInviteToken } from './tokens';

/** What the join page shows for a valid, unexpired invite link: the group and its unclaimed names. */
export async function findInvite(token: string) {
  if (!isInviteToken(token)) return null;
  const [invite] = await db()
    .select({ groupId: groups.id, groupName: groups.name })
    .from(invites)
    .innerJoin(groups, eq(groups.id, invites.groupId))
    .where(and(eq(invites.tokenHash, hashToken(token)), gt(invites.expiresAt, new Date())));
  if (!invite) return null;
  const placeholders = await db()
    .select({ id: members.id, name: members.name })
    .from(members)
    .where(and(eq(members.groupId, invite.groupId), isNull(members.userId)))
    .orderBy(members.seq);
  return { ...invite, placeholders };
}
