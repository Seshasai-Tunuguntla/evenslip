import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { formatPaise } from '@/lib/money';
import { db } from '@/server/db';
import { DEMO_USER_ID, FLAT_GROUP_ID, GOA_GROUP_ID, RESET_AFTER_MS, prepareDemoSignIn, resetDemoIfStale } from '@/server/demo';
import { loadDashboard, loadLedger } from '@/server/ledger';
import { demoState, expenses, groups } from '@/server/schema';
import { createGroup, createUser } from './helpers';

const makeStale = () => db().update(demoState).set({ resetAt: new Date(Date.now() - RESET_AFTER_MS - 1000) });

describe('the demo', () => {
  it('is a 5-person Goa trip with 12 expenses of every split type, where exact settles in 3 payments and greedy needs 4', async () => {
    await prepareDemoSignIn();
    const goa = await loadLedger(GOA_GROUP_ID);
    expect(goa.members.map((m) => m.name)).toEqual(['Asha', 'Ravi', 'Meera', 'Kabir', 'Dev']);
    expect(goa.members[0]?.userId).toBe(DEMO_USER_ID);
    expect(goa.expenses).toHaveLength(12);
    expect(new Set(goa.expenses.map((e) => e.splitType))).toEqual(new Set(['equal', 'exact', 'percent', 'shares']));
    expect(goa.balances.map((b) => formatPaise(b.paise))).toEqual(['₹14,682.99', '₹13,657.00', '−₹13,657.00', '−₹4,758.66', '−₹9,924.33']);
    expect(goa.settlement).toMatchObject({ method: 'exact', greedyCount: 4 });
    expect(goa.settlement.payments).toHaveLength(3);

    const dashboard = await loadDashboard(DEMO_USER_ID);
    expect(dashboard.groups.map((g) => g.id).toSorted()).toEqual([GOA_GROUP_ID, FLAT_GROUP_ID].toSorted());
    expect(dashboard.youOwe).toBeGreaterThan(0);
    expect(dashboard.youAreOwed).toBe(1_468_299);
  });

  it('rebuilds only when 30+ minutes old, and leaves real groups alone', async () => {
    await resetDemoIfStale();
    const real = await createGroup(await createUser('Real person'));
    await db().delete(expenses).where(eq(expenses.groupId, GOA_GROUP_ID));
    expect(await resetDemoIfStale()).toBe(false);
    expect((await loadLedger(GOA_GROUP_ID)).expenses).toHaveLength(0);

    await makeStale();
    expect(await resetDemoIfStale()).toBe(true);
    expect((await loadLedger(GOA_GROUP_ID)).expenses).toHaveLength(12);
    expect(await db().select().from(groups).where(eq(groups.id, real.groupId))).toHaveLength(1);
  });

  it('deletes groups the demo account made when it rebuilds', async () => {
    const extra = await createGroup(DEMO_USER_ID, [], true);
    await makeStale();
    await resetDemoIfStale();
    expect(await db().select().from(groups).where(eq(groups.id, extra.groupId))).toEqual([]);
  });

  it('runs one rebuild however many start at once', async () => {
    await makeStale();
    const results = await Promise.all(Array.from({ length: 4 }, () => resetDemoIfStale()));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await loadLedger(GOA_GROUP_ID)).expenses).toHaveLength(12);
  });
});
