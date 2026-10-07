import type { Balance } from './settle';

export type LedgerExpense = { paidBy: string; amountPaise: number; shares: readonly { memberId: string; paise: number }[] };
export type LedgerPayment = { fromMember: string; toMember: string; amountPaise: number };

/**
 * Each member's balance, in the order of `memberIds`: what they paid, minus their shares, plus the
 * payments they made to others, minus the payments they received. Positive: the group owes them.
 */
export function computeBalances(
  memberIds: readonly string[],
  expenses: readonly LedgerExpense[],
  payments: readonly LedgerPayment[],
): Balance[] {
  const totals = new Map(memberIds.map((id) => [id, 0]));
  const add = (id: string, paise: number) => totals.set(id, (totals.get(id) ?? 0) + paise);
  for (const e of expenses) {
    add(e.paidBy, e.amountPaise);
    for (const s of e.shares) add(s.memberId, -s.paise);
  }
  for (const p of payments) {
    add(p.fromMember, p.amountPaise);
    add(p.toMember, -p.amountPaise);
  }
  return [...totals].map(([memberId, paise]) => ({ memberId, paise }));
}
