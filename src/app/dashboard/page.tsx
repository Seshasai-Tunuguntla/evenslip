import type { Metadata } from 'next';
import Link from 'next/link';
import { BalanceAmount } from '@/components/Amount';
import { NameForm } from '@/components/forms';
import { formatPaise } from '@/lib/money';
import { createGroup } from '@/server/actions';
import { requireUser } from '@/server/guard';
import { loadDashboard } from '@/server/ledger';

export const metadata: Metadata = { title: 'Your groups' };

export default async function Dashboard() {
  const user = await requireUser();
  const { groups, youOwe, youAreOwed } = await loadDashboard(user.id);
  return (
    <main id="main" className="page">
      <div className="receipt-wrap narrow">
        <article className="receipt" aria-labelledby="dash-title">
          <p className="eyebrow">Total across {groups.length === 1 ? '1 group' : `${groups.length} groups`}</p>
          <h1 id="dash-title">Hello, {user.name}</h1>
          {user.isDemo ? (
            <p className="notice">This is a shared demo: other visitors see what you add, and it resets itself every 30 minutes.</p>
          ) : null}
          <dl className="totals">
            <div>
              <dt>You owe</dt>
              <dd className={youOwe > 0 ? 'amount owes' : 'amount'}>{formatPaise(youOwe)}</dd>
            </div>
            <div>
              <dt>You are owed</dt>
              <dd className="amount">{formatPaise(youAreOwed)}</dd>
            </div>
          </dl>
          <hr className="rule" />
          <h2>Your groups</h2>
          {groups.length === 0 ? (
            <p>No groups yet. Start one below, or open an invite link a friend sent you.</p>
          ) : (
            <ul className="lines group-list">
              {groups.map((g) => (
                <li key={g.id} className="group-line">
                  <Link href={`/groups/${g.id}`} className="group-link">
                    {g.name}
                  </Link>
                  <span className="fine-print">
                    {g.memberCount} members · {g.expenseCount} expenses
                  </span>
                  <BalanceAmount paise={g.balance} you />
                </li>
              ))}
            </ul>
          )}
          <hr className="rule" />
          <NameForm action={createGroup} label="Start a new group" button="Create group" placeholder="Flat 4B, Ladakh trip…" maxLength={60} />
        </article>
      </div>
    </main>
  );
}
