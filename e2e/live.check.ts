import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function checkPage(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test('live: the demo signs in and shows exact beating greedy', async ({ page }) => {
  await page.goto('/');
  await checkPage(page);
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Asha' })).toBeVisible();
  await checkPage(page);
  await page.getByRole('link', { name: 'Goa trip' }).click();
  await expect(page.getByText('3 payments instead of 4.')).toBeVisible();
  await checkPage(page);
});
