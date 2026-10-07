// Money is always an integer number of paise (₹1 = 100 paise). Floats never hold money: input is
// parsed from text digit by digit, and formatting splits rupees and paise with integer arithmetic.

/** The largest single expense or payment: ₹1,00,00,000 (one crore). Keeps every sum exact. */
export const MAX_PAISE = 1_000_000_000;

export const isPaise = (n: number) => Number.isSafeInteger(n) && n >= 0;

/**
 * Parses what someone typed as an amount in rupees ("1,250", "99.5", "₹ 12.75") into paise.
 * Returns null for anything that isn't a plain non-negative amount with at most two decimals.
 */
export function parseRupees(input: string): number | null {
  const text = input.trim().replace(/^₹\s*/, '').replaceAll(',', '');
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const [, rupees = '0', fraction = ''] = match;
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return paise <= MAX_PAISE ? paise : null;
}

const rupeeGroups = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** "₹1,23,456.50" in Indian digit grouping; negative amounts get a real minus sign. */
export function formatPaise(paise: number, { sign = false }: { sign?: boolean } = {}): string {
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  const prefix = paise < 0 ? '−' : sign && paise > 0 ? '+' : '';
  return `${prefix}₹${rupeeGroups.format(rupees)}.${rest}`;
}

/** The value for an amount input: "1250.50" (no symbol, no grouping), "" for zero. */
export function paiseToInput(paise: number): string {
  return paise === 0 ? '' : `${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

/** Percentages are stored in basis points (1% = 100) so "33.33%" is the integer 3333. */
export function parsePercent(input: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(input.trim().replace(/%$/, '').trim());
  if (!match) return null;
  const [, whole = '0', fraction = ''] = match;
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return bps <= 10_000 ? bps : null;
}

export function formatPercent(bps: number): string {
  const fraction = bps % 100;
  return fraction === 0 ? `${bps / 100}%` : `${Math.trunc(bps / 100)}.${String(fraction).padStart(2, '0').replace(/0$/, '')}%`;
}
