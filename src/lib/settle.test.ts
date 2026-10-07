import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EXACT_LIMIT, settleExact, settleGreedy, suggestPayments, type Balance, type Payment } from './settle';

const balancesOf = (...paise: number[]): Balance[] => paise.map((p, i) => ({ memberId: `m${i}`, paise: p }));

/** Applies the payments and returns what's left of each balance. */
function applyPayments(balances: readonly Balance[], payments: readonly Payment[]): number[] {
  const left = new Map(balances.map((b) => [b.memberId, b.paise]));
  for (const p of payments) {
    left.set(p.from, (left.get(p.from) ?? Number.NaN) + p.paise);
    left.set(p.to, (left.get(p.to) ?? Number.NaN) - p.paise);
  }
  return [...left.values()];
}

/**
 * Reference: the fewest payments by exhaustive search (a different method from the subset DP). Settles
 * the first open balance against every member of the opposite sign in turn and keeps the best.
 */
function bruteForceMinimum(paise: readonly number[]): number {
  const debts = paise.filter((p) => p !== 0);
  const search = (start: number): number => {
    while (start < debts.length && debts[start] === 0) start++;
    if (start === debts.length) return 0;
    const first = debts[start] ?? 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = start + 1; i < debts.length; i++) {
      const other = debts[i] ?? 0;
      if (other * first >= 0) continue;
      debts[i] = other + first;
      best = Math.min(best, 1 + search(start + 1));
      debts[i] = other;
    }
    return best;
  };
  return search(0);
}

const zeroSum = (values: number[]) => [...values, -values.reduce((a, b) => a + b, 0)];
// Small amounts make zero-sum subgroups common (where exact can beat greedy); large ones are realistic.
const smallBalances = fc.array(fc.integer({ min: -30, max: 30 }), { maxLength: 8 }).map(zeroSum);
const largeBalances = fc.array(fc.integer({ min: -5_000_000, max: 5_000_000 }), { maxLength: 8 }).map(zeroSum);
// Several zero-sum subgroups, shuffled together.
const groupedBalances = fc
  .tuple(fc.array(fc.array(fc.integer({ min: -9000, max: 9000 }), { minLength: 1, maxLength: 3 }).map(zeroSum), { maxLength: 3 }), fc.nat())
  .map(([groups, seed]) => groups.flat().map((v, i) => ({ v, k: (i * 7919 + seed) % 104_729 })).toSorted((a, b) => a.k - b.k).map((x) => x.v));
// At most 12 members, all within the exact limit.
const anyBalances = fc.oneof(smallBalances, largeBalances, groupedBalances);
// The exhaustive search is exponential: only for tiny groups.
const tinyBalances = anyBalances.filter((paise) => paise.filter((p) => p !== 0).length <= 8);

describe('settlement', () => {
  it('exact beats greedy on a fixed example: 3 payments instead of 4', () => {
    // {+4, -4} and {+5, -3, -2} each add up to zero, but greedy pairs the -4 with the +5 first.
    const balances = balancesOf(5, 4, -4, -3, -2);
    expect(settleGreedy(balances)).toEqual([
      { from: 'm2', to: 'm0', paise: 4 },
      { from: 'm3', to: 'm1', paise: 3 },
      { from: 'm4', to: 'm0', paise: 1 },
      { from: 'm4', to: 'm1', paise: 1 },
    ]);
    const exact = settleExact(balances);
    expect(exact).toHaveLength(3);
    expect(applyPayments(balances, exact)).toEqual([0, 0, 0, 0, 0]);
    expect(suggestPayments(balances)).toMatchObject({ method: 'exact', greedyCount: 4 });
  });

  it('needs no payments when everyone is even', () => {
    expect(settleExact(balancesOf(0, 0))).toEqual([]);
    expect(settleGreedy(balancesOf())).toEqual([]);
  });

  it('pays one debtor to one creditor directly', () => {
    expect(settleExact(balancesOf(-250, 0, 250))).toEqual([{ from: 'm0', to: 'm2', paise: 250 }]);
  });

  for (const [name, settle] of [['greedy', settleGreedy], ['exact', settleExact]] as const) {
    it(`${name}: settles everyone to zero with positive whole-paise payments and no self-payments`, () => {
      fc.assert(
        fc.property(anyBalances, (paise) => {
          const balances = balancesOf(...paise);
          const payments = settle(balances);
          expect(applyPayments(balances, payments).every((p) => p === 0)).toBe(true);
          for (const p of payments) {
            expect(p.from).not.toBe(p.to);
            expect(Number.isSafeInteger(p.paise) && p.paise > 0).toBe(true);
          }
          expect(payments.length).toBeLessThanOrEqual(Math.max(0, paise.filter((p) => p !== 0).length - 1));
        }),
      );
    });
  }

  it('exact is never worse than greedy', () => {
    fc.assert(
      fc.property(anyBalances, (paise) => {
        const balances = balancesOf(...paise);
        expect(settleExact(balances).length).toBeLessThanOrEqual(settleGreedy(balances).length);
      }),
      { numRuns: 300 },
    );
  });

  it('exact matches the brute-force minimum for tiny groups', () => {
    fc.assert(
      fc.property(tinyBalances, (paise) => {
        expect(settleExact(balancesOf(...paise)).length).toBe(bruteForceMinimum(paise));
      }),
      { numRuns: 300 },
    );
  });

  it('is deterministic', () => {
    fc.assert(fc.property(anyBalances, (paise) => {
      expect(settleExact(balancesOf(...paise))).toEqual(settleExact(balancesOf(...paise)));
    }));
  });

  it(`is exact up to ${EXACT_LIMIT} members with a balance, and greedy above that`, () => {
    const fifteen = balancesOf(...zeroSum(Array.from({ length: EXACT_LIMIT - 1 }, (_, i) => (i % 2 ? 1 : -1) * (i + 1) * 101)));
    const start = performance.now();
    expect(suggestPayments(fifteen).method).toBe('exact');
    expect(performance.now() - start).toBeLessThan(1000);
    const sixteen = balancesOf(...zeroSum(Array.from({ length: EXACT_LIMIT }, (_, i) => i + 1)));
    expect(suggestPayments(sixteen).method).toBe('greedy');
    expect(() => settleExact(sixteen)).toThrow(RangeError);
    // Members with a zero balance don't count towards the limit.
    expect(suggestPayments([...fifteen, ...balancesOf(0, 0, 0)]).method).toBe('exact');
  });
});
