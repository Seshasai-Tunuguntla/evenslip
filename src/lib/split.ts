// Splitting an expense between members, in whole paise. Every split assigns every paisa: the parts
// always add up to the total exactly.
//
// The remainder rule (deterministic): each person first gets the floor of their exact share; the
// paise left over go one each to the people whose exact shares had the largest fractional parts,
// and ties go to whoever comes first in the list (members in the order they joined the group).
// So ₹100 split equally three ways is 3334 + 3333 + 3333.
import { MAX_PAISE } from './money';

export const SPLIT_TYPES = ['equal', 'exact', 'percent', 'shares'] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

/** One person in a split. `value` is unused for equal, paise for exact, basis points for percent, a weight for shares. */
export type SplitPart = { memberId: string; value: number };
export type Share = { memberId: string; paise: number };
export type SplitResult = { ok: true; shares: Share[] } | { ok: false; error: string };

export const MAX_SHARE_WEIGHT = 1000;

/**
 * Splits `total` paise between the given members by weight with the remainder rule above.
 * Weights are positive integers. Uses BigInt so `total * weight` can never lose precision.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const t = BigInt(total);
  const w = BigInt(sum);
  const exact = weights.map((weight, index) => {
    const scaled = t * BigInt(weight);
    return { index, floor: Number(scaled / w), remainder: scaled % w };
  });
  let leftover = total - exact.reduce((a, p) => a + p.floor, 0);
  const result = exact.map((p) => p.floor);
  // Largest fractional part first; Array.prototype.sort is stable, so ties keep list order.
  const byRemainder = exact.toSorted((a, b) => (a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1));
  for (const p of byRemainder) {
    if (leftover === 0) break;
    result[p.index] = (result[p.index] ?? 0) + 1;
    leftover--;
  }
  return result;
}

export function splitExpense(total: number, type: SplitType, parts: readonly SplitPart[]): SplitResult {
  if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_PAISE) {
    return { ok: false, error: 'The amount must be more than ₹0 and at most ₹1,00,00,000.' };
  }
  if (parts.length === 0) return { ok: false, error: 'Choose at least one person to split with.' };
  if (new Set(parts.map((p) => p.memberId)).size !== parts.length) {
    return { ok: false, error: 'Each person can appear only once in a split.' };
  }
  const ids = parts.map((p) => p.memberId);
  const zip = (amounts: number[]): SplitResult => ({
    ok: true,
    shares: ids.map((memberId, i) => ({ memberId, paise: amounts[i] ?? 0 })),
  });

  switch (type) {
    case 'equal':
      return zip(allocate(total, parts.map(() => 1)));
    case 'exact': {
      if (parts.some((p) => !Number.isSafeInteger(p.value) || p.value <= 0)) {
        return { ok: false, error: 'Each exact amount must be more than ₹0.' };
      }
      const sum = parts.reduce((a, p) => a + p.value, 0);
      if (sum !== total) return { ok: false, error: 'The exact amounts must add up to the total.' };
      return zip(parts.map((p) => p.value));
    }
    case 'percent': {
      if (parts.some((p) => !Number.isSafeInteger(p.value) || p.value <= 0 || p.value > 10_000)) {
        return { ok: false, error: 'Each percentage must be more than 0% and at most 100%.' };
      }
      const sum = parts.reduce((a, p) => a + p.value, 0);
      if (sum !== 10_000) return { ok: false, error: 'The percentages must add up to 100%.' };
      return zip(allocate(total, parts.map((p) => p.value)));
    }
    case 'shares': {
      if (parts.some((p) => !Number.isSafeInteger(p.value) || p.value <= 0 || p.value > MAX_SHARE_WEIGHT)) {
        return { ok: false, error: `Each share must be a whole number from 1 to ${MAX_SHARE_WEIGHT}.` };
      }
      return zip(allocate(total, parts.map((p) => p.value)));
    }
    default:
      return { ok: false, error: 'Unknown split type.' };
  }
}
