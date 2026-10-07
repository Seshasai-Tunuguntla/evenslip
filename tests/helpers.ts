import { count, eq } from 'drizzle-orm';
import { expect, type Mock } from 'vitest';
import { auth } from '@/auth';
import { db } from '@/server/db';
import { expenseShares, expenses, groups, invites, members, payments, users } from '@/server/schema';

/** Makes `auth()` return a session for this user, or none. */
export function signInAs(userId: string | null) {
  (auth as unknown as Mock).mockResolvedValue(userId ? { user: { id: userId }, expires: '2099-01-01T00:00:00.000Z' } : null);
}

export async function createUser(name: string, isDemo = false): Promise<string> {
  const [row] = await db().insert(users).values({ name, isDemo }).returning({ id: users.id });
  if (!row) throw new Error('no user');
  return row.id;
}

/** A group with its owner as the first member, then the named placeholders. */
export async function createGroup(ownerId: string, placeholders: string[] = [], isDemo = false) {
  const [group] = await db().insert(groups).values({ name: 'Test trip', createdBy: ownerId, isDemo }).returning({ id: groups.id });
  if (!group) throw new Error('no group');
  const [owner] = await db().insert(members).values({ groupId: group.id, userId: ownerId, name: 'Owner' }).returning({ id: members.id });
  const others = [];
  for (const name of placeholders) {
    const [m] = await db().insert(members).values({ groupId: group.id, name }).returning({ id: members.id });
    if (m) others.push(m.id);
  }
  if (!owner) throw new Error('no owner');
  return { groupId: group.id, ownerMemberId: owner.id, memberIds: [owner.id, ...others] };
}

export function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

/** The fields the expense form posts. */
export function expenseForm(input: { description?: string; amount: string; paidBy: string; splitType?: string; parts: Record<string, string>; version?: number }) {
  const fields: Record<string, string> = {
    description: input.description ?? 'Dinner',
    amount: input.amount,
    paidBy: input.paidBy,
    spentOn: '2026-10-01',
    splitType: input.splitType ?? 'equal',
  };
  for (const [memberId, value] of Object.entries(input.parts)) {
    fields[`in.${memberId}`] = 'on';
    fields[`v.${memberId}`] = value;
  }
  if (input.version !== undefined) fields['version'] = String(input.version);
  return form(fields);
}

const digest = (error: unknown) => (error && typeof error === 'object' && 'digest' in error ? String(error.digest) : '');

export async function expectNotFound(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(digest(error), 'expected a 404').toBe('NEXT_HTTP_ERROR_FALLBACK;404');
}

export async function expectRedirect(promise: Promise<unknown>, to: string) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(digest(error), `expected a redirect to ${to}`).toMatch(new RegExp(`^NEXT_REDIRECT;\\w+;${to.replaceAll('/', '\\/')};`));
}

/** Everything a group holds, to check an action that was refused changed nothing. */
export async function snapshot(groupId: string) {
  const n = async (table: typeof members | typeof expenses | typeof payments | typeof invites) =>
    (await db().select({ n: count() }).from(table).where(eq(table.groupId, groupId)))[0]?.n;
  const expenseRows = await db().select().from(expenses).where(eq(expenses.groupId, groupId));
  const shares = await db().select({ share: expenseShares }).from(expenseShares).innerJoin(expenses, eq(expenses.id, expenseShares.expenseId)).where(eq(expenses.groupId, groupId));
  return {
    members: await n(members),
    payments: await n(payments),
    invites: await n(invites),
    expenses: expenseRows.map((e) => [e.id, e.description, e.amountPaise, e.version]).toSorted(),
    shares: shares.map((s) => [s.share.memberId, s.share.amountPaise]).toSorted(),
  };
}
