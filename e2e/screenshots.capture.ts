import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const shot = (name: string) => fileURLToPath(new URL(`../docs/screenshots/${name}.png`, import.meta.url));
const GOA = '/groups/00000000-0000-4000-8000-0000000000a1';

test('screenshots', async ({ browser }) => {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await desktop.goto('/');
  await desktop.screenshot({ path: shot('start') });
  await desktop.getByRole('button', { name: 'Try the demo' }).click();
  await expect(desktop.getByRole('heading', { name: 'Hello, Asha' })).toBeVisible();
  await desktop.screenshot({ path: shot('dashboard') });
  await desktop.goto(GOA);
  await expect(desktop.getByText('3 payments instead of 4.')).toBeVisible();
  await desktop.screenshot({ path: shot('group') });
  await desktop.getByRole('link', { name: 'Edit Fort Aguada tickets' }).click();
  await expect(desktop.getByRole('heading', { name: 'Edit an expense' })).toBeVisible();
  await desktop.screenshot({ path: shot('expense-form'), fullPage: true });

  // The link preview: 1200x630 at 1x, the settle-up receipt.
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, storageState: await desktop.context().storageState() });
  await og.goto(GOA);
  // Zoomed out so the balances and the three suggested payments fit in the card.
  await og.evaluate(() => document.body.style.setProperty('zoom', '0.72'));
  await og.screenshot({ path: fileURLToPath(new URL('../public/og-image.png', import.meta.url)) });

  const phone = await browser.newPage({ viewport: { width: 375, height: 812 }, storageState: await desktop.context().storageState() });
  await phone.goto(GOA);
  await phone.locator('#settle-title').scrollIntoViewIfNeeded();
  await phone.screenshot({ path: shot('group-phone') });
});
