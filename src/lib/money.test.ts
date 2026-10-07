import { describe, expect, it } from 'vitest';
import { formatPaise, formatPercent, paiseToInput, parsePercent, parseRupees } from './money';

describe('money', () => {
  it('parses rupees into whole paise without floats', () => {
    expect(parseRupees('1,234.5')).toBe(123_450);
    expect(parseRupees('₹ 0.01')).toBe(1);
    expect(parseRupees(' 99 ')).toBe(9900);
    expect(parseRupees('10000000')).toBe(1_000_000_000);
    for (const bad of ['', 'abc', '1.234', '-5', '1e3', '10000000.01', '.5', '12.']) expect(parseRupees(bad)).toBeNull();
  });

  it('formats paise in Indian digit grouping', () => {
    expect(formatPaise(12_345_678)).toBe('₹1,23,456.78');
    expect(formatPaise(-5)).toBe('−₹0.05');
    expect(formatPaise(100, { sign: true })).toBe('+₹1.00');
    expect(formatPaise(0, { sign: true })).toBe('₹0.00');
    expect(paiseToInput(123_405)).toBe('1234.05');
  });

  it('parses and formats percentages as basis points', () => {
    expect(parsePercent('33.33')).toBe(3333);
    expect(parsePercent('12.5%')).toBe(1250);
    expect(parsePercent('100.01')).toBeNull();
    expect(formatPercent(3333)).toBe('33.33%');
    expect(formatPercent(1250)).toBe('12.5%');
    expect(formatPercent(2500)).toBe('25%');
  });
});
