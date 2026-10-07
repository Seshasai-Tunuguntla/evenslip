// The demo, end to end: try the demo -> dashboard -> the Goa trip's settle-up (exact beats greedy)
// -> mark a payment as paid -> add an expense split three ways -> see it on the receipt. axe checks
// every screen (WCAG 2.2 A and AA rules), and nothing may scroll sideways.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { E2E_DATABASE_URL } from './prepareDb.ts';

async function checkPage(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test.beforeEach(async () => {
  // Make the demo stale, so signing in rebuilds it fresh for this run.
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  await client.query("update demo_state set reset_at = now() - interval '1 hour'");
  await client.end();
});

test('the demo: settle up in fewer payments, mark one paid, add an expense', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Who owes whom');
  await checkPage(page);
  await page.getByRole('button', { name: 'Try the demo' }).click();

  await expect(page.getByRole('heading', { name: 'Hello, Asha' })).toBeVisible();
  await expect(page.getByText('₹14,682.99').first()).toBeVisible();
  await checkPage(page);
  await page.getByRole('link', { name: 'Goa trip' }).click();

  await expect(page.getByRole('heading', { name: 'Goa trip' })).toBeVisible();
  await expect(page.getByText('3 payments instead of 4.')).toBeVisible();
  await expect(page.locator('.suggestion')).toHaveCount(3);
  await checkPage(page);

  await page.getByRole('button', { name: 'Mark as paid: Dev pays You ₹9,924.33' }).click();
  await expect(page.locator('.paid-line')).toContainText('Dev → You');
  await expect(page.locator('.suggestion')).toHaveCount(2);
  await checkPage(page);

  await page.getByRole('link', { name: 'Add expense' }).click();
  await expect(page.getByRole('heading', { name: 'Add an expense' })).toBeVisible();
  await page.getByLabel('What was it?').fill('Coconut water');
  await page.getByLabel('Amount (₹)').fill('100');
  await page.getByRole('checkbox', { name: 'Kabir' }).uncheck();
  await page.getByRole('checkbox', { name: 'Dev' }).uncheck();
  // ₹100 three ways: the leftover paisa goes to the first in the list.
  await expect(page.locator('.participant-share')).toHaveText(['₹33.34', '₹33.33', '₹33.33', 'not in', 'not in']);
  await checkPage(page);
  await page.getByRole('button', { name: 'Add expense' }).click();

  await expect(page.getByRole('link', { name: 'Edit Coconut water' })).toBeVisible();
  await expect(page.getByText('13 expenses')).toBeVisible();
  await checkPage(page);
});
