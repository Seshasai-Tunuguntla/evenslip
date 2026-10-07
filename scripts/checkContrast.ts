// Checks WCAG contrast for every colour pair the components use, reading the tokens straight from
// src/app/tokens.css (so the check can't drift from the stylesheet). Runs in CI: `npm run contrast`.
// Ported from the Calendar Aggregator.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/tokens.css', import.meta.url), 'utf8');
const tokens = new Map<string, string>();
for (const [, name, hex] of css.matchAll(/(--color-[\w-]+):\s*(#[0-9a-f]{6})\b/gi)) {
  if (name && hex) tokens.set(name, hex);
}

const channel = (hex: string, i: number) => {
  const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
const contrast = (a: string, b: string) => {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum]: 4.5 for text, 3 for control edges and the focus ring.
const paper = ['--color-paper', '--color-paper-deep'];
const PAIRS: [string, string, number][] = [
  ...[...paper, '--color-highlight', '--color-red-wash'].map((bg): [string, string, number] => ['--color-ink', bg, 4.5]),
  ...[...paper, '--color-highlight'].map((bg): [string, string, number] => ['--color-ink-muted', bg, 4.5]),
  // "Owes" amounts, errors and the PAID stamp.
  ...[...paper, '--color-red-wash', '--color-highlight'].map((bg): [string, string, number] => ['--color-red', bg, 4.5]),
  // Printed buttons: paper-coloured text on ink, and the delete button.
  ['--color-paper', '--color-ink', 4.5],
  ['--color-paper', '--color-red', 4.5],
  // The counter around the receipts: header, footer and links.
  ['--color-desk-ink', '--color-desk', 4.5],
  ['--color-desk-muted', '--color-desk', 4.5],
  // Input and checkbox edges, and the focus rings.
  ...paper.map((bg): [string, string, number] => ['--color-control-line', bg, 3]),
  ...[...paper, '--color-highlight'].map((bg): [string, string, number] => ['--color-focus', bg, 3]),
  ['--color-desk-focus', '--color-desk', 3],
];

let failed = 0;
for (const [fg, bg, min] of PAIRS) {
  const a = tokens.get(fg);
  const b = tokens.get(bg);
  if (!a || !b) {
    console.error(`missing token: ${a ? bg : fg}`);
    failed++;
    continue;
  }
  const ratio = contrast(a, b);
  if (ratio < min) {
    console.error(`FAIL ${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
    failed++;
  }
}
if (failed > 0) process.exit(1);
console.info(`contrast: all ${PAIRS.length} colour pairs meet WCAG AA`);
