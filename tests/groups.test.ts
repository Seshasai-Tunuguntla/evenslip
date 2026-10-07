import { createHash } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createInvite, deleteExpense, joinGroup, markAsPaid, saveExpense, undoPayment } from '@/server/actions';
import { db } from '@/server/db';
import { loadLedger } from '@/server/ledger';
import { expenseShares, expenses, invites, members, payments } from '@/server/schema';
import { createGroup, createUser, expectRedirect, expenseForm, form, signInAs } from './helpers';

async function groupWithExpense() {
  const owner = await createUser('Owner');
  const { groupId, memberIds } = await createGroup(owner, ['Ravi', 'Meera']);
  const [a = '', b = '', c = ''] = memberIds;
  signInAs(owner);
  await expectRedirect(saveExpense(groupId, null, null, expenseForm({ amount: '100', paidBy: a, parts: { [a]: '', [b]: '', [c]: '' } })), `/groups/${groupId}`);
  const [expense] = await db().select().from(expenses).where(eq(expenses.groupId, groupId));
  if (!expense) throw new Error('no expense');
  return { owner, groupId, a, b, c, expense };
}

const sharesOf = async (expenseId: string) =>
  (await db().select().from(expenseShares).innerJoin(members, eq(members.id, expenseShares.memberId)).where(eq(expenseShares.expenseId, expenseId)).orderBy(asc(members.seq))).map(
    (r) => r.expense_shares.amountPaise,
  );

describe('expenses', () => {
  it('stores every paisa, leftover paise to the members who joined first', async () => {
    const { expense } = await groupWithExpense();
    expect(expense).toMatchObject({ amountPaise: 10_000, version: 1, splitType: 'equal' });
    expect(await sharesOf(expense.id)).toEqual([3334, 3333, 3333]);
  });

  it('a stale edit gets a conflict message and never overwrites the newer save', async () => {
    const { groupId, a, b, expense } = await groupWithExpense();
    const second = await createUser('Second editor');
    await db().update(members).set({ userId: second }).where(eq(members.id, b));

    // Both opened the form at version 1. The first save wins and bumps the version.
    await expectRedirect(saveExpense(groupId, expense.id, null, expenseForm({ description: 'First', amount: '60', paidBy: a, parts: { [a]: '' }, version: 1 })), `/groups/${groupId}`);
    signInAs(second);
    const stale = await saveExpense(groupId, expense.id, null, expenseForm({ description: 'Second', amount: '80', paidBy: b, parts: { [b]: '' }, version: 1 }));
    expect(stale).toMatchObject({ conflict: true, error: expect.stringMatching(/Someone else saved this expense/) });

    const [now] = await db().select().from(expenses).where(eq(expenses.id, expense.id));
    expect(now).toMatchObject({ description: 'First', amountPaise: 6000, paidBy: a, version: 2 });
    expect(await sharesOf(expense.id)).toEqual([6000]);
  });

  it('two saves at the same moment from the same version: exactly one lands', async () => {
    const { groupId, a, b, expense } = await groupWithExpense();
    const results = await Promise.allSettled(
      ['One', 'Two'].map((description) => saveExpense(groupId, expense.id, null, expenseForm({ description, amount: '50', paidBy: a, parts: { [a]: '', [b]: '' }, version: 1 }))),
    );
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1); // the redirect after a save
    expect(results.filter((r) => r.status === 'fulfilled' && r.value?.conflict)).toHaveLength(1);
    const [now] = await db().select().from(expenses).where(eq(expenses.id, expense.id));
    expect(now?.version).toBe(2);
  });

  it('a stale delete is refused; a current one deletes the expense and its shares', async () => {
    const { groupId, a, expense } = await groupWithExpense();
    await expectRedirect(saveExpense(groupId, expense.id, null, expenseForm({ amount: '70', paidBy: a, parts: { [a]: '' }, version: 1 })), `/groups/${groupId}`);
    expect(await deleteExpense(groupId, expense.id, null, form({ version: '1' }))).toMatchObject({ conflict: true });
    await expectRedirect(deleteExpense(groupId, expense.id, null, form({ version: '2' })), `/groups/${groupId}`);
    expect(await db().select().from(expenses).where(eq(expenses.id, expense.id))).toEqual([]);
    expect(await db().select().from(expenseShares).where(eq(expenseShares.expenseId, expense.id))).toEqual([]);
  });

  it('saves each split type, and rejects invalid ones without writing', async () => {
    const { groupId, a, b, c } = await groupWithExpense();
    const save = (splitType: string, parts: Record<string, string>, amount = '1000') => saveExpense(groupId, null, null, expenseForm({ splitType, amount, paidBy: a, parts }));
    await expectRedirect(save('exact', { [a]: '250', [b]: '750.00' }), `/groups/${groupId}`);
    await expectRedirect(save('percent', { [a]: '50', [b]: '25', [c]: '25' }), `/groups/${groupId}`);
    await expectRedirect(save('shares', { [a]: '2', [b]: '1', [c]: '1' }), `/groups/${groupId}`);
    expect(await save('exact', { [a]: '250', [b]: '700' })).toEqual({ error: 'The exact amounts must add up to the total.' });
    expect(await save('percent', { [a]: '50', [b]: '40' })).toEqual({ error: 'The percentages must add up to 100%.' });
    expect(await save('shares', { [a]: 'two' })).toEqual({ error: 'Check the value for Owner.' });
    expect(await save('equal', {})).toEqual({ error: 'Choose at least one person to split with.' });
    expect(await save('equal', { [a]: '' }, '-5')).toMatchObject({ error: expect.stringMatching(/amount/) });
    expect(await save('bogus', { [a]: '' })).toEqual({ error: 'Choose how to split it.' });
    const ledger = await loadLedger(groupId);
    expect(ledger.expenses).toHaveLength(4);
    expect(ledger.balances.reduce((sum, x) => sum + x.paise, 0)).toBe(0);
  });
});

async function violates(query: PromiseLike<unknown>, constraint: string) {
  const error = await Promise.resolve(query).then(() => null, (e: unknown) => e);
  expect(error, `expected ${constraint} to refuse it`).toMatchObject({ cause: { constraint } });
}

describe('database constraints', () => {
  it('rejects non-positive amounts and payments to yourself, whatever the app does', async () => {
    const { owner, groupId, a, b, expense } = await groupWithExpense();
    await violates(db().update(expenses).set({ amountPaise: 0 }).where(eq(expenses.id, expense.id)), 'expenses_amount_positive');
    await violates(db().update(expenses).set({ amountPaise: -100 }).where(eq(expenses.id, expense.id)), 'expenses_amount_positive');
    await violates(db().update(expenseShares).set({ amountPaise: -1 }).where(eq(expenseShares.expenseId, expense.id)), 'expense_shares_amount_not_negative');
    await violates(db().insert(payments).values({ groupId, fromMember: b, toMember: a, amountPaise: 0, createdBy: owner }), 'payments_amount_positive');
    await violates(db().insert(payments).values({ groupId, fromMember: a, toMember: a, amountPaise: 5, createdBy: owner }), 'payments_not_to_self');
  });
});

describe('mark as paid', () => {
  it('records a suggested payment once; a repeat or a made-up payment is refused', async () => {
    const { groupId, a, b, c } = await groupWithExpense();
    const paid = () => markAsPaid(groupId, null, form({ from: b, to: a, paise: '3333' }));
    const results = await Promise.all([paid(), paid()]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(results.filter((r) => r?.error)).toHaveLength(1);
    expect(await markAsPaid(groupId, null, form({ from: c, to: a, paise: '999' }))).toMatchObject({ error: expect.any(String) });
    const ledger = await loadLedger(groupId);
    expect(ledger.payments).toHaveLength(1);
    expect(ledger.balances.map((x) => x.paise)).toEqual([3333, 0, -3333]);

    await undoPayment(groupId, ledger.payments[0]?.id ?? '', null, form({}));
    expect((await loadLedger(groupId)).balances.map((x) => x.paise)).toEqual([6666, -3333, -3333]);
  });
});

describe('invites', () => {
  it('stores only the hash of the token, and the link lets a signed-in user join or claim a placeholder', async () => {
    const { groupId, b } = await groupWithExpense();
    const result = await createInvite(groupId, null, form({}));
    const token = result?.invitePath?.replace('/join/', '') ?? '';
    expect(token).toMatch(/^[\w-]{43}$/);
    const [stored] = await db().select().from(invites).where(eq(invites.groupId, groupId));
    expect(stored?.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(token);

    const ravi = await createUser('Ravi K');
    signInAs(ravi);
    await expectRedirect(joinGroup(token, null, form({ claim: b })), `/groups/${groupId}`);
    const [claimed] = await db().select().from(members).where(eq(members.id, b));
    expect(claimed?.userId).toBe(ravi);

    const other = await createUser('Someone');
    signInAs(other);
    expect(await joinGroup(token, null, form({ claim: b }))).toMatchObject({ error: expect.stringMatching(/already claimed/) });
    await expectRedirect(joinGroup(token, null, form({})), `/groups/${groupId}`);
    expect(await db().select().from(members).where(and(eq(members.groupId, groupId), eq(members.userId, other)))).toHaveLength(1);
  });

  it("a new link replaces the old one, and demo accounts and groups can't use invites", async () => {
    const { owner, groupId } = await groupWithExpense();
    const first = (await createInvite(groupId, null, form({})))?.invitePath ?? '';
    await createInvite(groupId, null, form({}));
    const joiner = await createUser('Late');
    signInAs(joiner);
    const error = await joinGroup(first.replace('/join/', ''), null, form({})).then(() => null, (e: unknown) => e);
    expect(error).toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });

    signInAs(owner);
    const fresh = (await createInvite(groupId, null, form({})))?.invitePath ?? '';
    const demoUser = await createUser('Demo visitor', true);
    signInAs(demoUser);
    expect(await joinGroup(fresh.replace('/join/', ''), null, form({}))).toMatchObject({ error: expect.stringMatching(/demo account/) });
    const demoGroup = await createGroup(demoUser, [], true);
    expect(await createInvite(demoGroup.groupId, null, form({}))).toMatchObject({ error: expect.stringMatching(/Demo groups/) });
  });
});

describe('joining twice at once', () => {
  it('ends with one membership and no database error, however the requests interleave', async () => {
    const { groupId, b, c } = await groupWithExpense();
    const token = (await createInvite(groupId, null, form({})))?.invitePath?.replace('/join/', '') ?? '';
    for (let round = 0; round < 5; round++) {
      const user = await createUser(`Double clicker ${round}`);
      signInAs(user);
      const results = await Promise.allSettled([form({ claim: b }), form({}), form({ claim: c })].map((f) => joinGroup(token, null, f)));
      // Each one either lands in the group (a redirect) or is told the name was taken; nothing throws.
      const outcomes = results.map((r) => (r.status === 'rejected' ? String((r.reason as { digest?: unknown }).digest) : (r.value?.error ?? 'no error')));
      for (const outcome of outcomes) expect(outcome).toMatch(new RegExp(`^NEXT_REDIRECT;\\w+;/groups/${groupId};|already claimed`));
      expect(await db().select().from(members).where(and(eq(members.groupId, groupId), eq(members.userId, user)))).toHaveLength(1);
      // Free the placeholders again for the next round.
      await db().update(members).set({ userId: null }).where(and(eq(members.groupId, groupId), eq(members.userId, user)));
      await db().delete(members).where(and(eq(members.groupId, groupId), eq(members.userId, user)));
    }
  });
});

describe('limits', () => {
  it('caps a group at 2,000 expenses', async () => {
    const { owner, groupId, a } = await groupWithExpense();
    await db().insert(expenses).values(
      Array.from({ length: 1999 }, () => ({ groupId, description: 'Chai', amountPaise: 1000, paidBy: a, splitType: 'equal' as const, spentOn: '2026-10-01', createdBy: owner })),
    );
    expect(await saveExpense(groupId, null, null, expenseForm({ amount: '10', paidBy: a, parts: { [a]: '' } }))).toMatchObject({ error: expect.stringMatching(/at most 2,000 expenses/) });
  });
});
