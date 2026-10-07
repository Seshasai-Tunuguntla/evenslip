// Reading a group's money: its members, expenses and recorded payments, turned into balances and
// settle-up suggestions. Callers check membership first (src/server/guard.ts).
import 'server-only';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { computeBalances } from '@/lib/balances';
import { suggestPayments, type Balance, type Settlement } from '@/lib/settle';
import { db, type Db, type Tx } from './db';
import { expenseShares, expenses, groups, members, payments } from './schema';

export type LedgerMember = { id: string; name: string; userId: string | null };
export type Ledger = {
  members: LedgerMember[];
  expenses: (typeof expenses.$inferSelect & { shares: (typeof expenseShares.$inferSelect)[] })[];
  payments: (typeof payments.$inferSelect)[];
  balances: Balance[];
  settlement: Settlement;
};

/** Members in join order: the order splits use to hand out leftover paise. */
export function groupMembers(groupIds: string[], conn: Db | Tx = db()) {
  return conn
    .select({ id: members.id, name: members.name, userId: members.userId, groupId: members.groupId })
    .from(members)
    .where(inArray(members.groupId, groupIds))
    .orderBy(asc(members.seq));
}

async function loadLedgers(groupIds: string[], conn: Db | Tx): Promise<Map<string, Ledger>> {
  const result = new Map<string, Ledger>();
  if (groupIds.length === 0) return result;
  // One after another: inside a transaction they share a single connection.
  const memberRows = await groupMembers(groupIds, conn);
  const expenseRows = await conn.select().from(expenses).where(inArray(expenses.groupId, groupIds)).orderBy(desc(expenses.spentOn), desc(expenses.seq));
  const shareRows = await conn
    .select({ share: expenseShares })
    .from(expenseShares)
    .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
    .where(inArray(expenses.groupId, groupIds));
  const paymentRows = await conn.select().from(payments).where(inArray(payments.groupId, groupIds)).orderBy(desc(payments.createdAt));
  const sharesByExpense = Map.groupBy(shareRows.map((r) => r.share), (s) => s.expenseId);
  for (const groupId of groupIds) {
    const groupMemberRows = memberRows.filter((m) => m.groupId === groupId);
    const order = new Map(groupMemberRows.map((m, i) => [m.id, i]));
    const groupExpenses = expenseRows
      .filter((e) => e.groupId === groupId)
      .map((e) => ({
        ...e,
        shares: (sharesByExpense.get(e.id) ?? []).toSorted((a, b) => (order.get(a.memberId) ?? 0) - (order.get(b.memberId) ?? 0)),
      }));
    const groupPayments = paymentRows.filter((p) => p.groupId === groupId);
    const balances = computeBalances(
      groupMemberRows.map((m) => m.id),
      groupExpenses.map((e) => ({ paidBy: e.paidBy, amountPaise: e.amountPaise, shares: e.shares.map((s) => ({ memberId: s.memberId, paise: s.amountPaise })) })),
      groupPayments,
    );
    result.set(groupId, {
      members: groupMemberRows.map(({ id, name, userId }) => ({ id, name, userId })),
      expenses: groupExpenses,
      payments: groupPayments,
      balances,
      settlement: suggestPayments(balances),
    });
  }
  return result;
}

export async function loadLedger(groupId: string, conn: Db | Tx = db()): Promise<Ledger> {
  const ledger = (await loadLedgers([groupId], conn)).get(groupId);
  if (!ledger) throw new Error('loadLedger: group not loaded');
  return ledger;
}

export type DashboardGroup = { id: string; name: string; isDemo: boolean; memberCount: number; expenseCount: number; balance: number };

/** Every group the user belongs to, with their own balance in each, and the totals across groups. */
export async function loadDashboard(userId: string) {
  const mine = await db()
    .select({ memberId: members.id, id: groups.id, name: groups.name, isDemo: groups.isDemo })
    .from(members)
    .innerJoin(groups, eq(groups.id, members.groupId))
    .where(eq(members.userId, userId))
    .orderBy(desc(groups.createdAt));
  const ledgers = await loadLedgers(mine.map((g) => g.id), db());
  const list: DashboardGroup[] = mine.map((g) => {
    const ledger = ledgers.get(g.id);
    return {
      id: g.id,
      name: g.name,
      isDemo: g.isDemo,
      memberCount: ledger?.members.length ?? 0,
      expenseCount: ledger?.expenses.length ?? 0,
      balance: ledger?.balances.find((b) => b.memberId === g.memberId)?.paise ?? 0,
    };
  });
  return {
    groups: list,
    youOwe: list.reduce((sum, g) => sum + Math.max(0, -g.balance), 0),
    youAreOwed: list.reduce((sum, g) => sum + Math.max(0, g.balance), 0),
  };
}
