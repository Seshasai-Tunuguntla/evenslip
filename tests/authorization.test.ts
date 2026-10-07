// Every Server Action, called by someone signed out and by a signed-in non-member: the first is
// sent to the start page, the second gets a 404, and neither changes anything.
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, createGroup as createGroupAction, createInvite, deleteExpense, joinGroup, markAsPaid, saveExpense, undoPayment } from '@/server/actions';
import { db } from '@/server/db';
import { expenses, groups, payments } from '@/server/schema';
import { createGroup, createUser, expectNotFound, expectRedirect, expenseForm, form, signInAs, snapshot } from './helpers';

let owner: string;
let outsider: string;
let groupId: string;
let memberIds: string[];
let expenseId: string;
let paymentId: string;

beforeAll(async () => {
  owner = await createUser('Owner');
  outsider = await createUser('Outsider');
  ({ groupId, memberIds } = await createGroup(owner, ['Ravi', 'Meera']));
  const [a = '', b = '', c = ''] = memberIds;
  signInAs(owner);
  await expectRedirect(saveExpense(groupId, null, null, expenseForm({ amount: '300', paidBy: a, parts: { [a]: '', [b]: '', [c]: '' } })), `/groups/${groupId}`);
  const [expense] = await db().select().from(expenses).where(eq(expenses.groupId, groupId));
  expenseId = expense?.id ?? '';
  const [payment] = await db().insert(payments).values({ groupId, fromMember: b, toMember: a, amountPaise: 100, createdBy: owner }).returning();
  paymentId = payment?.id ?? '';
});

// Each action, called on the test group with otherwise valid input.
const actions: [string, () => Promise<unknown>][] = [
  ['addMember', () => addMember(groupId, null, form({ name: 'Kabir' }))],
  ['createInvite', () => createInvite(groupId, null, form({}))],
  ['saveExpense (new)', () => saveExpense(groupId, null, null, expenseForm({ amount: '90', paidBy: memberIds[0] ?? '', parts: { [memberIds[0] ?? '']: '' } }))],
  ['saveExpense (edit)', () => saveExpense(groupId, expenseId, null, expenseForm({ description: 'Hijacked', amount: '1', paidBy: memberIds[0] ?? '', parts: { [memberIds[0] ?? '']: '' }, version: 1 }))],
  ['deleteExpense', () => deleteExpense(groupId, expenseId, null, form({ version: '1' }))],
  ['markAsPaid', () => markAsPaid(groupId, null, form({ from: memberIds[2] ?? '', to: memberIds[0] ?? '', paise: '10000' }))],
  ['undoPayment', () => undoPayment(groupId, paymentId, null, form({}))],
];

describe('signed out', () => {
  for (const [name, call] of actions) {
    it(`${name}: redirects to the start page and changes nothing`, async () => {
      const before = await snapshot(groupId);
      signInAs(null);
      await expectRedirect(call(), '/');
      expect(await snapshot(groupId)).toEqual(before);
    });
  }

  it('createGroup: redirects to the start page and creates nothing', async () => {
    signInAs(null);
    const before = (await db().select().from(groups)).length;
    await expectRedirect(createGroupAction(null, form({ name: 'Sneaky' })), '/');
    expect((await db().select().from(groups)).length).toBe(before);
  });

  it('joinGroup: redirects to the start page', async () => {
    signInAs(null);
    await expectRedirect(joinGroup('x'.repeat(43), null, form({})), '/');
    expect(await snapshot(groupId)).toMatchObject({ members: 3 });
  });

  it('a session for a user that no longer exists counts as signed out', async () => {
    signInAs('00000000-0000-4000-8000-00000000dead');
    await expectRedirect(addMember(groupId, null, form({ name: 'Ghost' })), '/');
  });
});

describe('signed in, not a member', () => {
  for (const [name, call] of actions) {
    it(`${name}: 404 and changes nothing`, async () => {
      const before = await snapshot(groupId);
      signInAs(outsider);
      await expectNotFound(call());
      expect(await snapshot(groupId)).toEqual(before);
    });
  }

  it('gets the same 404 for a group that does not exist or an id that is not a UUID', async () => {
    signInAs(outsider);
    await expectNotFound(addMember('00000000-0000-4000-8000-000000000999', null, form({ name: 'X' })));
    await expectNotFound(addMember("1' or '1'='1", null, form({ name: 'X' })));
  });

  it("can't reach another group's expense or payment through a group they do belong to", async () => {
    signInAs(outsider);
    const own = await createGroup(outsider);
    const before = await snapshot(groupId);
    const result = await saveExpense(own.groupId, expenseId, null, expenseForm({ description: 'Hijacked', amount: '1', paidBy: own.ownerMemberId, parts: { [own.ownerMemberId]: '' }, version: 1 }));
    expect(result).toMatchObject({ conflict: true });
    await expectRedirect(deleteExpense(own.groupId, expenseId, null, form({ version: '1' })), `/groups/${own.groupId}`);
    await undoPayment(own.groupId, paymentId, null, form({}));
    // A payer from another group isn't a member here.
    expect(await saveExpense(own.groupId, null, null, expenseForm({ amount: '5', paidBy: memberIds[1] ?? '', parts: { [own.ownerMemberId]: '' } }))).toEqual({ error: 'Choose who paid.' });
    expect(await snapshot(groupId)).toEqual(before);
  });

  it('joinGroup with a token that matches no invite: 404', async () => {
    signInAs(outsider);
    await expectNotFound(joinGroup('y'.repeat(43), null, form({})));
    await expectNotFound(joinGroup('../../etc', null, form({})));
  });
});
