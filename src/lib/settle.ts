// Settling up: turning balances into payments that bring everyone to zero.
//
// A balance is positive when the group owes that member money (they paid more than their share)
// and negative when they owe the group. Balances always add up to zero.
//
// Two algorithms:
// - Greedy: the largest debtor pays the largest creditor as much as possible, repeat. Fast, at most
//   n - 1 payments, but not always the fewest.
// - Exact minimum: a settlement with p payments links members into connected groups, each of which
//   must add up to zero, and a zero-sum group of k members needs at least k - 1 payments. So the
//   fewest payments is n - (the largest number of disjoint zero-sum subgroups the members can be
//   split into). A DP over subsets finds that number in O(2^n * n); within each subgroup, greedy
//   then settles it in exactly k - 1 payments (every payment zeroes at least one member, the last
//   one zeroes two). Exact for up to EXACT_LIMIT members with a non-zero balance, greedy above that.

export type Balance = { memberId: string; paise: number };
export type Payment = { from: string; to: string; paise: number };
export type Settlement = { payments: Payment[]; method: 'exact' | 'greedy'; greedyCount: number };

/** 2^15 masks * 15 members is about half a million steps: well under a millisecond or two. */
export const EXACT_LIMIT = 15;

const nonZero = (balances: readonly Balance[]) => balances.filter((b) => b.paise !== 0);

/** Largest debtor pays largest creditor. Ties go to whoever comes first in `balances`. */
export function settleGreedy(balances: readonly Balance[]): Payment[] {
  const left = nonZero(balances).map((b) => ({ ...b }));
  const payments: Payment[] = [];
  for (;;) {
    let debtor: (typeof left)[number] | undefined;
    let creditor: (typeof left)[number] | undefined;
    for (const b of left) {
      if (b.paise < 0 && (!debtor || b.paise < debtor.paise)) debtor = b;
      if (b.paise > 0 && (!creditor || b.paise > creditor.paise)) creditor = b;
    }
    if (!debtor || !creditor) return payments;
    const paise = Math.min(-debtor.paise, creditor.paise);
    payments.push({ from: debtor.memberId, to: creditor.memberId, paise });
    debtor.paise += paise;
    creditor.paise -= paise;
  }
}

/** The fewest payments (see the top of the file). Throws above EXACT_LIMIT non-zero balances. */
export function settleExact(balances: readonly Balance[]): Payment[] {
  const members = nonZero(balances);
  const n = members.length;
  if (n > EXACT_LIMIT) throw new RangeError(`settleExact handles at most ${EXACT_LIMIT} non-zero balances`);
  if (n === 0) return [];

  const size = 1 << n;
  // sum[mask]: the total balance of the members in mask. Exact: |sum| <= n * 2^31 < 2^53.
  const sum = new Float64Array(size);
  // groups[mask]: the most disjoint zero-sum subgroups the members of mask can be split into.
  const groups = new Int8Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = 31 - Math.clz32(mask & -mask);
    sum[mask] = (sum[mask & (mask - 1)] ?? 0) + (members[low]?.paise ?? 0);
    let best = 0;
    for (let rest = mask; rest !== 0; rest &= rest - 1) {
      const without = mask & ~(rest & -rest);
      best = Math.max(best, groups[without] ?? 0);
    }
    groups[mask] = best + (sum[mask] === 0 ? 1 : 0);
  }

  // Walk back from everyone, removing one member at a time along an optimal path. The masks on the
  // path that sum to zero cut the removal order into the zero-sum subgroups.
  const subgroups: Balance[][] = [];
  let current: Balance[] = [];
  let mask = size - 1;
  while (mask !== 0) {
    const zero = sum[mask] === 0 ? 1 : 0;
    let removed = -1;
    for (let i = 0; i < n && removed < 0; i++) {
      const bit = 1 << i;
      if ((mask & bit) !== 0 && (groups[mask ^ bit] ?? 0) + zero === groups[mask]) removed = i;
    }
    const member = members[removed];
    if (!member) throw new Error('settleExact: no optimal step found');
    current.push(member);
    mask ^= 1 << removed;
    if (sum[mask] === 0) {
      subgroups.push(current);
      current = [];
    }
  }
  // Keep the members' original order inside each subgroup, so greedy's tie-breaks stay stable.
  const order = new Map(members.map((m, i) => [m.memberId, i]));
  return subgroups.flatMap((group) =>
    settleGreedy(group.toSorted((a, b) => (order.get(a.memberId) ?? 0) - (order.get(b.memberId) ?? 0))),
  );
}

/** What the settle-up panel shows: the exact minimum when it's affordable, greedy otherwise. */
export function suggestPayments(balances: readonly Balance[]): Settlement {
  const greedy = settleGreedy(balances);
  if (nonZero(balances).length > EXACT_LIMIT) return { payments: greedy, method: 'greedy', greedyCount: greedy.length };
  return { payments: settleExact(balances), method: 'exact', greedyCount: greedy.length };
}
