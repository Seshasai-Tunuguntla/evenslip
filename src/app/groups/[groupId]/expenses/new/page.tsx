import type { Metadata } from 'next';
import Link from 'next/link';
import { ExpenseForm } from '@/components/ExpenseForm';
import { todayIso } from '@/lib/site';
import { saveExpense } from '@/server/actions';
import { requireMember } from '@/server/guard';
import { groupMembers } from '@/server/ledger';

export const metadata: Metadata = { title: 'Add an expense' };

export default async function NewExpense({ params }: PageProps<'/groups/[groupId]/expenses/new'>) {
  const { groupId } = await params;
  const { group, memberId } = await requireMember(groupId);
  const members = await groupMembers([group.id]);
  return (
    <main id="main" className="page">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link href={`/groups/${group.id}`}>← {group.name}</Link>
      </nav>
      <div className="receipt-wrap narrow">
        <article className="receipt" aria-labelledby="form-title">
          <p className="eyebrow">{group.name}</p>
          <h1 id="form-title">Add an expense</h1>
          <ExpenseForm
            action={saveExpense.bind(null, group.id, null)}
            members={members.map(({ id, name }) => ({ id, name }))}
            initial={{ description: '', amount: '', paidBy: memberId, spentOn: todayIso(), splitType: 'equal', included: members.map((m) => m.id), values: {}, version: 0 }}
            conflictHref={`/groups/${group.id}/expenses/new`}
            submitLabel="Add expense"
          />
        </article>
      </div>
    </main>
  );
}
