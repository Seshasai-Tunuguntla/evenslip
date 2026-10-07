import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExpenseForm } from '@/components/ExpenseForm';
import { DeleteExpenseForm } from '@/components/forms';
import { formatPercent, paiseToInput } from '@/lib/money';
import { deleteExpense, saveExpense } from '@/server/actions';
import { requireMember } from '@/server/guard';
import { loadLedger } from '@/server/ledger';

export const metadata: Metadata = { title: 'Edit an expense' };

export default async function EditExpense({ params }: PageProps<'/groups/[groupId]/expenses/[expenseId]'>) {
  const { groupId, expenseId } = await params;
  const { group } = await requireMember(groupId);
  const ledger = await loadLedger(group.id);
  const expense = ledger.expenses.find((e) => e.id === expenseId);
  if (!expense) notFound();
  // Refill each person's value the way it was typed.
  const values = Object.fromEntries(
    expense.shares.map((s) => {
      const v = s.inputValue ?? 0;
      const text = expense.splitType === 'exact' ? paiseToInput(v) : expense.splitType === 'percent' ? formatPercent(v).replace('%', '') : String(v);
      return [s.memberId, text];
    }),
  );
  const href = `/groups/${group.id}/expenses/${expense.id}`;
  return (
    <main id="main" className="page">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link href={`/groups/${group.id}`}>← {group.name}</Link>
      </nav>
      <div className="receipt-wrap narrow">
        <article className="receipt" aria-labelledby="form-title">
          <p className="eyebrow">{group.name}</p>
          <h1 id="form-title">Edit an expense</h1>
          <ExpenseForm
            action={saveExpense.bind(null, group.id, expense.id)}
            members={ledger.members.map(({ id, name }) => ({ id, name }))}
            initial={{
              description: expense.description,
              amount: paiseToInput(expense.amountPaise),
              paidBy: expense.paidBy,
              spentOn: expense.spentOn,
              splitType: expense.splitType,
              included: expense.shares.map((s) => s.memberId),
              values,
              version: expense.version,
            }}
            conflictHref={href}
            submitLabel="Save changes"
          />
          <hr className="rule" />
          <DeleteExpenseForm action={deleteExpense.bind(null, group.id, expense.id)} version={expense.version} />
        </article>
      </div>
    </main>
  );
}
