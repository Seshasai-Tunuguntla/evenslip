import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocate, splitExpense, type SplitPart, type SplitType } from './split';

const parts = (...values: number[]): SplitPart[] => values.map((value, i) => ({ memberId: `m${i}`, value }));
const amounts = (total: number, type: SplitType, p: SplitPart[]) => {
  const result = splitExpense(total, type, p);
  if (!result.ok) throw new Error(result.error);
  return result.shares.map((s) => s.paise);
};
const error = (total: number, type: SplitType, p: SplitPart[]) => {
  const result = splitExpense(total, type, p);
  return result.ok ? null : result.error;
};

describe('splits', () => {
  it('splits ₹100 three ways as 3334 + 3333 + 3333: leftover paise go to the first in the list', () => {
    expect(amounts(10_000, 'equal', parts(0, 0, 0))).toEqual([3334, 3333, 3333]);
    expect(amounts(10_001, 'equal', parts(0, 0, 0))).toEqual([3334, 3334, 3333]);
    expect(amounts(2, 'equal', parts(0, 0, 0))).toEqual([1, 1, 0]);
  });

  it('gives leftover paise to the largest fractional parts first', () => {
    // Exact shares 33.33 and 66.67: the larger fraction (0.67) gets the paisa.
    expect(allocate(100, [1, 2])).toEqual([33, 67]);
    expect(allocate(1, [3, 2])).toEqual([1, 0]);
  });

  it('exact: uses the amounts as given', () => {
    expect(amounts(5000, 'exact', parts(1250, 3750))).toEqual([1250, 3750]);
  });

  it('percent: by basis points, remainder rule included', () => {
    expect(amounts(10_000, 'percent', parts(3333, 3333, 3334))).toEqual([3333, 3333, 3334]);
    expect(amounts(999, 'percent', parts(5000, 5000))).toEqual([500, 499]);
    expect(amounts(600_000, 'percent', parts(2500, 2500, 2500, 1250, 1250))).toEqual([150_000, 150_000, 150_000, 75_000, 75_000]);
  });

  it('shares: by weight, remainder rule included', () => {
    expect(amounts(100_000, 'shares', parts(2, 1, 1))).toEqual([50_000, 25_000, 25_000]);
    expect(amounts(100, 'shares', parts(1, 1, 1))).toEqual([34, 33, 33]);
  });

  it('rejects invalid input', () => {
    expect(error(0, 'equal', parts(0))).toMatch(/more than ₹0/);
    expect(error(-100, 'equal', parts(0))).toMatch(/more than ₹0/);
    expect(error(10.5, 'equal', parts(0))).toMatch(/more than ₹0/);
    expect(error(1_000_000_001, 'equal', parts(0))).toMatch(/at most/);
    expect(error(100, 'equal', [])).toMatch(/at least one/);
    expect(error(100, 'equal', [{ memberId: 'a', value: 0 }, { memberId: 'a', value: 0 }])).toMatch(/only once/);
    expect(error(100, 'exact', parts(60, 30))).toMatch(/add up to the total/);
    expect(error(100, 'exact', parts(100, 0))).toMatch(/more than ₹0/);
    expect(error(100, 'exact', parts(50.5, 49.5))).toMatch(/more than ₹0/);
    expect(error(100, 'percent', parts(5000, 4000))).toMatch(/add up to 100%/);
    expect(error(100, 'percent', parts(10_000, 0))).toMatch(/more than 0%/);
    expect(error(100, 'percent', parts(10_001))).toMatch(/at most 100%/);
    expect(error(100, 'shares', parts(1, 0))).toMatch(/whole number/);
    expect(error(100, 'shares', parts(1.5, 1))).toMatch(/whole number/);
    expect(error(100, 'shares', parts(1001))).toMatch(/whole number/);
    expect(error(100, 'nope' as SplitType, parts(1))).toMatch(/Unknown/);
  });

  it('always assigns every paisa, each part within one paisa of its exact share', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000_000 }), fc.array(fc.integer({ min: 1, max: 10_000 }), { minLength: 1, maxLength: 50 }), (total, weights) => {
        const result = allocate(total, weights);
        const sum = weights.reduce((a, b) => a + b, 0);
        expect(result.reduce((a, b) => a + b, 0)).toBe(total);
        result.forEach((part, i) => {
          const exactTimesSum = BigInt(total) * BigInt(weights[i] ?? 0);
          const diff = BigInt(part) * BigInt(sum) - exactTimesSum;
          expect(diff >= 0n ? diff < BigInt(sum) : -diff < BigInt(sum)).toBe(true);
        });
        expect(allocate(total, weights)).toEqual(result);
      }),
    );
  });
});
