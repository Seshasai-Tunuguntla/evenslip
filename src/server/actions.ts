'use server';
// Every Server Action. Each one starts on the server with requireUser (signed out: redirect to the
// start page) or requireMember (not a member: 404), and treats every argument, bound or not, as
// untrusted input from the browser.
import { randomBytes } from 'node:crypto';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { parsePercent, parseRupees } from '@/lib/money';
import { SPLIT_TYPES, splitExpense, type SplitPart, type SplitType } from '@/lib/split';
import { db } from './db';
import { isUuid, requireMember, requireUser } from './guard';
import { groupMembers, loadLedger } from './ledger';
import { expenseShares, expenses, groups, invites, members, payments } from './schema';
import { hashToken, isInviteToken } from './tokens';

export type ActionState = { error?: string; conflict?: boolean; invitePath?: string } | null;

const MAX_MEMBERS = 50;
// Every page load reads a group's whole ledger, so its size is capped.
const MAX_EXPENSES = 2000;
const INVITE_DAYS = 7;

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};
const violatesConstraint = (error: unknown, constraint: string) => {
  const cause: unknown = error instanceof Error && error.cause ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'constraint' in cause && cause.constraint === constraint;
};
const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? 'Check the form and try again.';

const groupName = z.string().trim().min(1, 'Give the group a name.').max(60, 'Keep the name to 60 characters.');
const memberName = z.string().trim().min(1, 'Enter a name.').max(40, 'Keep the name to 40 characters.');

const refresh = (groupId: string) => {
  revalidatePath(`/groups/${groupId}`);
  revalidatePath('/dashboard');
};

export async function createGroup(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const name = groupName.safeParse(text(form, 'name'));
  if (!name.success) return { error: firstIssue(name.error) };
  const groupId = await db().transaction(async (tx) => {
    const [group] = await tx.insert(groups).values({ name: name.data, createdBy: user.id, isDemo: user.isDemo }).returning({ id: groups.id });
    if (!group) throw new Error('createGroup: no row returned');
    await tx.insert(members).values({ groupId: group.id, userId: user.id, name: user.name.slice(0, 40) });
    return group.id;
  });
  revalidatePath('/dashboard');
  redirect(`/groups/${groupId}`);
}

/** Adds a placeholder member: a name only, for someone without an account (yet). */
export async function addMember(groupId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { group } = await requireMember(groupId);
  const name = memberName.safeParse(text(form, 'name'));
  if (!name.success) return { error: firstIssue(name.error) };
  const existing = await groupMembers([group.id]);
  if (existing.length >= MAX_MEMBERS) return { error: `A group can have at most ${MAX_MEMBERS} members.` };
  if (existing.some((m) => m.name.toLowerCase() === name.data.toLowerCase())) {
    return { error: `There's already a member called ${name.data}.` };
  }
  await db().insert(members).values({ groupId: group.id, name: name.data });
  refresh(group.id);
  return null;
}

/**
 * Makes a new invite link (replacing the group's previous one) and returns its path, once: only
 * the token's SHA-256 hash is stored, so the link can't be shown again later.
 */
export async function createInvite(groupId: string, _prev: ActionState, _form: FormData): Promise<ActionState> {
  const { user, group } = await requireMember(groupId);
  if (group.isDemo) return { error: "Demo groups can't invite people. Sign in with GitHub to make a group of your own." };
  const token = randomBytes(32).toString('base64url');
  const values = { groupId: group.id, tokenHash: hashToken(token), createdBy: user.id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) };
  await db()
    .insert(invites)
    .values(values)
    .onConflictDoUpdate({ target: invites.groupId, set: { tokenHash: values.tokenHash, createdBy: user.id, createdAt: sql`now()`, expiresAt: values.expiresAt } });
  return { invitePath: `/join/${token}` };
}

/** The invite token is the authorization here: a valid, unexpired link lets a signed-in user join. */
export async function joinGroup(token: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!isInviteToken(token)) notFound();
  const [invite] = await db().select().from(invites).where(eq(invites.tokenHash, hashToken(token)));
  if (!invite || invite.expiresAt <= new Date()) notFound();
  if (user.isDemo) return { error: "The demo account can't join groups. Sign in with GitHub to join." };

  const current = await groupMembers([invite.groupId]);
  if (current.some((m) => m.userId === user.id)) redirect(`/groups/${invite.groupId}`);
  const claim = text(form, 'claim');
  try {
    if (claim) {
      // Become one of the placeholder members, keeping their expenses. Only if nobody else did first.
      if (!isUuid(claim)) return { error: 'Choose one of the names on the list.' };
      const claimed = await db()
        .update(members)
        .set({ userId: user.id })
        .where(and(eq(members.id, claim), eq(members.groupId, invite.groupId), isNull(members.userId)))
        .returning({ id: members.id });
      if (claimed.length === 0) return { error: 'Someone else has already claimed that name. Choose another, or join as a new member.' };
    } else {
      if (current.length >= MAX_MEMBERS) return { error: `This group already has ${MAX_MEMBERS} members.` };
      await db().insert(members).values({ groupId: invite.groupId, userId: user.id, name: user.name.slice(0, 40) }).onConflictDoNothing();
    }
  } catch (error) {
    // The same person joining twice at once (two tabs): the later write hits the one-membership-per-
    // user constraint after the check above passed for both. The earlier one made them a member.
    if (!violatesConstraint(error, 'members_group_user')) throw error;
  }
  refresh(invite.groupId);
  redirect(`/groups/${invite.groupId}`);
}

const expenseFields = z.object({
  description: z.string().trim().min(1, 'Add a description.').max(80, 'Keep the description to 80 characters.'),
  paidBy: z.string(),
  spentOn: z.iso.date({ error: 'Pick a valid date.' }).refine((d) => d >= '2000-01-01' && d <= '2099-12-31', 'Pick a valid date.'),
  splitType: z.enum(SPLIT_TYPES, { error: 'Choose how to split it.' }),
});

const parseValue = (type: SplitType, raw: string): number | null => {
  switch (type) {
    case 'equal':
      return 0;
    case 'exact':
      return parseRupees(raw);
    case 'percent':
      return parsePercent(raw);
    case 'shares':
      return /^\d{1,4}$/.test(raw.trim()) ? Number(raw.trim()) : null;
    default:
      return null;
  }
};

const CONFLICT =
  'Someone else saved this expense after you opened it, so your changes were not saved. Reload the page to see their version, then make your change again.';

/**
 * Creates an expense (expenseId null) or saves an edit. An edit only lands if the expense is still
 * at the version the form was opened at; otherwise nothing is written and the editor is told why.
 */
export async function saveExpense(groupId: string, expenseId: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { user, group } = await requireMember(groupId);
  if (expenseId !== null && !isUuid(expenseId)) notFound();

  const fields = expenseFields.safeParse({
    description: text(form, 'description'),
    paidBy: text(form, 'paidBy'),
    spentOn: text(form, 'spentOn'),
    splitType: text(form, 'splitType'),
  });
  if (!fields.success) return { error: firstIssue(fields.error) };
  const { description, paidBy, spentOn, splitType } = fields.data;
  const amount = parseRupees(text(form, 'amount'));
  if (amount === null || amount === 0) return { error: 'Enter an amount in rupees, like 1250 or 99.50.' };

  const groupMemberRows = await groupMembers([group.id]);
  if (!groupMemberRows.some((m) => m.id === paidBy)) return { error: 'Choose who paid.' };
  const parts: SplitPart[] = [];
  for (const m of groupMemberRows) {
    if (text(form, `in.${m.id}`) !== 'on') continue;
    const value = parseValue(splitType, text(form, `v.${m.id}`));
    if (value === null) return { error: `Check the value for ${m.name}.` };
    parts.push({ memberId: m.id, value });
  }
  const split = splitExpense(amount, splitType, parts);
  if (!split.ok) return { error: split.error };
  const shareRows = (id: string) =>
    split.shares.map((s, i) => ({ expenseId: id, memberId: s.memberId, amountPaise: s.paise, inputValue: splitType === 'equal' ? null : (parts[i]?.value ?? null) }));
  const values = { description, amountPaise: amount, paidBy, splitType, spentOn };

  if (expenseId === null) {
    // A soft cap: two saves at the same moment can both pass it, which is harmless.
    const [existing] = await db().select({ n: count() }).from(expenses).where(eq(expenses.groupId, group.id));
    if ((existing?.n ?? 0) >= MAX_EXPENSES) return { error: `A group can have at most ${MAX_EXPENSES.toLocaleString('en-IN')} expenses. Start a new group to keep going.` };
    await db().transaction(async (tx) => {
      const [row] = await tx.insert(expenses).values({ ...values, groupId: group.id, createdBy: user.id }).returning({ id: expenses.id });
      if (!row) throw new Error('saveExpense: no row returned');
      await tx.insert(expenseShares).values(shareRows(row.id));
    });
  } else {
    const version = Number(text(form, 'version'));
    if (!Number.isSafeInteger(version)) return { error: CONFLICT, conflict: true };
    const outcome = await db().transaction(async (tx) => {
      const [existing] = await tx.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.groupId, group.id)));
      if (!existing) return 'missing' as const;
      const updated = await tx
        .update(expenses)
        .set({ ...values, version: sql`${expenses.version} + 1`, updatedAt: sql`now()` })
        .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, group.id), eq(expenses.version, version)))
        .returning({ id: expenses.id });
      if (updated.length === 0) return 'conflict' as const;
      await tx.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId));
      await tx.insert(expenseShares).values(shareRows(expenseId));
      return 'saved' as const;
    });
    if (outcome === 'missing') return { error: 'This expense was deleted by someone else, so there is nothing to save.', conflict: true };
    if (outcome === 'conflict') return { error: CONFLICT, conflict: true };
  }
  refresh(group.id);
  redirect(`/groups/${group.id}`);
}

/** Deletes an expense, if it's still the version the person looked at. */
export async function deleteExpense(groupId: string, expenseId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { group } = await requireMember(groupId);
  if (!isUuid(expenseId)) notFound();
  const version = Number(text(form, 'version'));
  const deleted = await db()
    .delete(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, group.id), eq(expenses.version, Number.isSafeInteger(version) ? version : -1)))
    .returning({ id: expenses.id });
  if (deleted.length === 0) {
    const [still] = await db().select({ id: expenses.id }).from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.groupId, group.id)));
    if (still) return { error: 'Someone else changed this expense after you opened it. Reload to see the change before deleting it.', conflict: true };
  }
  refresh(group.id);
  redirect(`/groups/${group.id}`);
}

const paymentFields = z.object({ from: z.uuid(), to: z.uuid(), paise: z.coerce.number().int().positive() });

/**
 * "Mark as paid" on a settle-up suggestion: records that payment, but only while it's still one of
 * the current suggestions. The group row is locked meanwhile, so a double click or a second tab
 * can't record the same payment twice.
 */
export async function markAsPaid(groupId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { user, group } = await requireMember(groupId);
  const payment = paymentFields.safeParse({ from: text(form, 'from'), to: text(form, 'to'), paise: text(form, 'paise') });
  if (!payment.success) return { error: 'That payment is not valid.' };
  const { from, to, paise } = payment.data;
  const recorded = await db().transaction(async (tx) => {
    await tx.select({ id: groups.id }).from(groups).where(eq(groups.id, group.id)).for('update');
    const ledger = await loadLedger(group.id, tx);
    if (!ledger.settlement.payments.some((p) => p.from === from && p.to === to && p.paise === paise)) return false;
    await tx.insert(payments).values({ groupId: group.id, fromMember: from, toMember: to, amountPaise: paise, createdBy: user.id });
    return true;
  });
  if (!recorded) {
    refresh(group.id);
    return { error: 'The balances changed since this page loaded, so nothing was recorded. The suggestions are now up to date.' };
  }
  refresh(group.id);
  return null;
}

/** Undoes a recorded payment (for one marked as paid by mistake). */
export async function undoPayment(groupId: string, paymentId: string, _prev: ActionState, _form: FormData): Promise<ActionState> {
  const { group } = await requireMember(groupId);
  if (!isUuid(paymentId)) notFound();
  await db().delete(payments).where(and(eq(payments.id, paymentId), eq(payments.groupId, group.id)));
  refresh(group.id);
  return null;
}
