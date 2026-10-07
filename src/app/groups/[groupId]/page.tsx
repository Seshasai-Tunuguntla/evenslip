import type { Metadata } from 'next';
import Link from 'next/link';
import { BalanceAmount } from '@/components/Amount';
import { InviteLink, MarkPaidForm, NameForm, UndoPaymentForm } from '@/components/forms';
import { formatPaise } from '@/lib/money';
import type { SplitType } from '@/lib/split';
import { addMember, createInvite, markAsPaid, undoPayment } from '@/server/actions';
import { requireMember } from '@/server/guard';
import { loadLedger } from '@/server/ledger';

export const metadata: Metadata = { title: 'Group' };

const SPLIT_WORDS: Record<SplitType, string> = { equal: 'equally', exact: 'by exact amounts', percent: 'by percentages', shares: 'by shares' };
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortDate = (isoDate: string) => dateFormat.format(new Date(`${isoDate}T00:00:00Z`));

export default async function GroupPage({ params }: PageProps<'/groups/[groupId]'>) {
  const { groupId } = await params;
  const { group, memberId: you } = await requireMember(groupId);
  const ledger = await loadLedger(group.id);
  const name = new Map(ledger.members.map((m) => [m.id, m.id === you ? 'You' : m.name]));
  const totalSpent = ledger.expenses.reduce((sum, e) => sum + e.amountPaise, 0);
  const { payments, method, greedyCount } = ledger.settlement;
  const paymentLabel = (p: { from: string; to: string; paise: number }) => `${name.get(p.from)} pays ${name.get(p.to)} ${formatPaise(p.paise)}`;

  let settleNote: string;
  if (payments.length === 0) settleNote = 'Everyone is even. Nothing to settle.';
  else if (method === 'greedy') settleNote = `${payments.length} payments settle everyone, largest debt first. (With more than 15 people owing or owed, the exact minimum takes too long to find.)`;
  else if (greedyCount > payments.length) settleNote = `${payments.length} payments instead of ${greedyCount}. Paying the largest debt first would take ${greedyCount}; this is the fewest possible.`;
  else settleNote = `${payments.length === 1 ? '1 payment settles' : `${payments.length} payments settle`} everyone: the fewest possible.`;

  return (
    <main id="main" className="page">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link href="/dashboard">← Your groups</Link>
      </nav>
      <div className="receipt-grid">
        <div className="receipt-wrap">
          <article className="receipt" aria-labelledby="group-title">
            <p className="eyebrow">{group.isDemo ? 'Demo group' : 'Group'}</p>
            <h1 id="group-title">{group.name}</h1>
            <p className="fine-print">
              {ledger.members.length} members · {ledger.expenses.length} expenses · {formatPaise(totalSpent)} spent
            </p>
            <hr className="rule" />
            <section aria-labelledby="balances-title">
              <h2 id="balances-title">Balances</h2>
              <ul className="lines">
                {ledger.balances.map((b) => (
                  <li key={b.memberId} className={b.memberId === you ? 'line line-you' : 'line'}>
                    <span>{name.get(b.memberId)}</span>
                    <span className="leader" aria-hidden="true" />
                    <BalanceAmount paise={b.paise} you={b.memberId === you} />
                  </li>
                ))}
              </ul>
            </section>
            <hr className="rule" />
            <section aria-labelledby="settle-title">
              <h2 id="settle-title">Settle up</h2>
              <p className={greedyCount > payments.length ? 'callout' : ''}>{settleNote}</p>
              {payments.length > 0 ? (
                <ol className="suggestions">
                  {payments.map((p) => (
                    <li key={`${p.from}-${p.to}-${p.paise}`} className="suggestion">
                      <span className="suggestion-text">
                        <strong>{name.get(p.from)}</strong> {p.from === you ? 'pay' : 'pays'} <strong>{name.get(p.to)}</strong>
                      </span>
                      <span className="amount">{formatPaise(p.paise)}</span>
                      <MarkPaidForm action={markAsPaid.bind(null, group.id)} from={p.from} to={p.to} paise={p.paise} label={paymentLabel(p)} />
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
            {ledger.payments.length > 0 ? (
              <>
                <hr className="rule" />
                <section aria-labelledby="paid-title">
                  <h2 id="paid-title">Paid</h2>
                  <ul className="lines">
                    {ledger.payments.map((p) => (
                      <li key={p.id} className="paid-line">
                        <span>
                          {name.get(p.fromMember)} → {name.get(p.toMember)}
                        </span>
                        <span className="amount">{formatPaise(p.amountPaise)}</span>
                        <span className="stamp">Paid</span>
                        <UndoPaymentForm action={undoPayment.bind(null, group.id, p.id)} label={`${name.get(p.fromMember)} paid ${name.get(p.toMember)} ${formatPaise(p.amountPaise)}`} />
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            ) : null}
          </article>
        </div>

        <div className="receipt-wrap">
          <article className="receipt" aria-labelledby="expenses-title">
            <div className="receipt-heading-row">
              <h2 id="expenses-title">Expenses</h2>
              <Link href={`/groups/${group.id}/expenses/new`} className="button button-small">
                Add expense
              </Link>
            </div>
            {ledger.expenses.length === 0 ? (
              <p>No expenses yet. Add the first one: who paid, how much, and who it was for.</p>
            ) : (
              <ul className="expense-list">
                {ledger.expenses.map((e) => (
                  <li key={e.id} className="expense">
                    <span className="expense-date">{shortDate(e.spentOn)}</span>
                    <Link href={`/groups/${group.id}/expenses/${e.id}`} className="expense-title" aria-label={`Edit ${e.description}`}>
                      {e.description}
                    </Link>
                    <span className="amount">{formatPaise(e.amountPaise)}</span>
                    <span className="expense-meta">
                      {name.get(e.paidBy)} paid · split {SPLIT_WORDS[e.splitType]} between {e.shares.length}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <hr className="rule" />
            <p className="total-line">
              <span>Total</span>
              <span className="amount">{formatPaise(totalSpent)}</span>
            </p>
          </article>
        </div>

        <div className="receipt-wrap">
          <article className="receipt" aria-labelledby="members-title">
            <h2 id="members-title">Members</h2>
            <ul className="lines">
              {ledger.members.map((m) => (
                <li key={m.id} className="line">
                  <span>
                    {m.name}
                    {m.id === you ? ' (you)' : ''}
                  </span>
                  <span className="leader" aria-hidden="true" />
                  <span className="fine-print">{m.userId ? 'member' : 'no account'}</span>
                </li>
              ))}
            </ul>
            <NameForm action={addMember.bind(null, group.id)} label="Add someone without an account" button="Add" placeholder="Name" maxLength={40} />
            <hr className="rule" />
            <h3>Invite</h3>
            {group.isDemo ? (
              <p className="fine-print">Invites are off in the demo. Sign in with GitHub to invite people to a group of your own.</p>
            ) : (
              <InviteLink action={createInvite.bind(null, group.id)} />
            )}
          </article>
        </div>
      </div>
    </main>
  );
}
