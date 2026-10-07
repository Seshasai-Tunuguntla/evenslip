// The demo: one shared account ("Asha"), signed in with one click, in two groups. It rebuilds
// itself when it's 30+ minutes old: on a cold start (src/instrumentation.ts) and on every demo
// sign-in. The last rebuild time is in the database and the rebuild runs under a transaction-scoped
// advisory lock, so however many instances start at once, exactly one rebuilds and the others wait
// for it, then see a fresh demo and do nothing. Real users' groups are never touched: a rebuild
// deletes only groups marked is_demo, which only the demo account can make.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { splitExpense, type SplitType } from '@/lib/split';
import { db, type Tx } from './db';
import { demoState, expenseShares, expenses, groups, members, users } from './schema';

export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
export const GOA_GROUP_ID = '00000000-0000-4000-8000-0000000000a1';
export const FLAT_GROUP_ID = '00000000-0000-4000-8000-0000000000b1';
export const RESET_AFTER_MS = 30 * 60_000;
const LOCK_KEY = 7_316_001; // any constant; names the demo's advisory lock
const DEMO_NAME = 'Asha';

type Seed = {
  id: string;
  name: string;
  members: string[]; // the first is Asha, the demo account
  expenses: [description: string, rupees: number, paidBy: number, type: SplitType, parts: [member: number, value: number][], spentOn: string][];
};

// Fixed ids (…a10, …a11 in the Goa trip; …b10 in the flat), so open tabs keep working after a rebuild.
const memberId = (groupId: string, index: number) => `${groupId.slice(0, -3)}${groupId.slice(-2, -1)}${index + 10}`;

// Balances come out at Asha +14,682.99, Ravi +13,657.00, Meera -13,657.00, Kabir -4,758.66 and
// Dev -9,924.33. {Ravi, Meera} and {Asha, Kabir, Dev} each add up to zero, so 3 payments settle
// everyone; greedy starts with Meera (largest debt) paying Asha (largest credit) and needs 4.
// tests/demo.test.ts checks exactly that.
const SEEDS: Seed[] = [
  {
    id: GOA_GROUP_ID,
    name: 'Goa trip',
    members: [DEMO_NAME, 'Ravi', 'Meera', 'Kabir', 'Dev'],
    expenses: [
      ['Flights to Goa', 28_500, 0, 'equal', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], '2026-09-17'],
      ['Villa in Anjuna, 3 nights', 21_000, 1, 'shares', [[0, 2], [1, 2], [2, 2], [3, 1], [4, 1]], '2026-09-17'],
      ['Scooter rentals', 3600, 3, 'exact', [[0, 90_000], [1, 90_000], [2, 90_000], [3, 90_000]], '2026-09-18'],
      ['Beach shack dinner', 4860, 2, 'equal', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], '2026-09-18'],
      ['Groceries for the villa', 2350, 4, 'equal', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], '2026-09-18'],
      ['Dudhsagar jeep safari', 6000, 0, 'percent', [[0, 2500], [1, 2500], [2, 2500], [3, 1250], [4, 1250]], '2026-09-19'],
      ['Fort Aguada tickets', 1000, 1, 'equal', [[0, 0], [1, 0], [2, 0]], '2026-09-19'],
      ["Seafood at Britto's", 7450, 3, 'shares', [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2]], '2026-09-19'],
      ['Sunset cruise', 3000, 4, 'equal', [[0, 0], [2, 0], [3, 0], [4, 0]], '2026-09-20'],
      ['Petrol', 1800, 1, 'exact', [[1, 60_000], [2, 60_000], [3, 60_000]], '2026-09-20'],
      ['Cashews and feni to take home', 2400, 2, 'percent', [[0, 5000], [2, 5000]], '2026-09-20'],
      ['Last-night party', 9000, 1, 'exact', [[0, 150_000], [1, 217_600], [2, 200_000], [3, 180_000], [4, 152_400]], '2026-09-20'],
    ],
  },
  {
    id: FLAT_GROUP_ID,
    name: 'Flat 302',
    members: [DEMO_NAME, 'Nikhil', 'Sara'],
    expenses: [
      ['October rent', 45_000, 1, 'equal', [[0, 0], [1, 0], [2, 0]], '2026-10-01'],
      ['Wi-Fi, October', 1180, 2, 'equal', [[0, 0], [1, 0], [2, 0]], '2026-10-02'],
      ['Groceries', 3460, 0, 'shares', [[0, 1], [1, 1], [2, 2]], '2026-10-04'],
    ],
  },
];

async function rebuild(tx: Tx) {
  await tx.insert(users).values({ id: DEMO_USER_ID, name: DEMO_NAME, isDemo: true }).onConflictDoUpdate({ target: users.id, set: { name: DEMO_NAME, isDemo: true } });
  await tx.delete(groups).where(eq(groups.isDemo, true));
  for (const seed of SEEDS) {
    await tx.insert(groups).values({ id: seed.id, name: seed.name, createdBy: DEMO_USER_ID, isDemo: true });
    // One row at a time, so the join order (members.seq) is the order above.
    for (const [i, name] of seed.members.entries()) {
      await tx.insert(members).values({ id: memberId(seed.id, i), groupId: seed.id, userId: i === 0 ? DEMO_USER_ID : null, name });
    }
    for (const [description, rupees, paidBy, type, parts, spentOn] of seed.expenses) {
      const amountPaise = rupees * 100;
      const splitParts = parts.map(([m, value]) => ({ memberId: memberId(seed.id, m), value }));
      const split = splitExpense(amountPaise, type, splitParts);
      if (!split.ok) throw new Error(`demo expense "${description}": ${split.error}`);
      const id = randomUUID();
      await tx.insert(expenses).values({ id, groupId: seed.id, description, amountPaise, paidBy: memberId(seed.id, paidBy), splitType: type, spentOn, createdBy: DEMO_USER_ID });
      await tx.insert(expenseShares).values(
        split.shares.map((s, i) => ({ expenseId: id, memberId: s.memberId, amountPaise: s.paise, inputValue: type === 'equal' ? null : (splitParts[i]?.value ?? null) })),
      );
    }
  }
}

/** Rebuilds the demo if it has never been built or is 30+ minutes old. Returns whether it rebuilt. */
export async function resetDemoIfStale(now = new Date()): Promise<boolean> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`);
    const [state] = await tx.select().from(demoState).where(eq(demoState.id, 1));
    if (state && now.getTime() - state.resetAt.getTime() < RESET_AFTER_MS) return false;
    await rebuild(tx);
    await tx.insert(demoState).values({ id: 1, resetAt: now }).onConflictDoUpdate({ target: demoState.id, set: { resetAt: now } });
    return true;
  });
}

/** For the demo provider's authorize(): a fresh-enough demo, and its account. */
export async function prepareDemoSignIn(): Promise<{ id: string; name: string }> {
  await resetDemoIfStale();
  return { id: DEMO_USER_ID, name: DEMO_NAME };
}
