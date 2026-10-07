'use client';
// Add or edit an expense. The split preview runs the same splitExpense as the server, so what you
// see is what gets saved, to the paisa; the server still validates everything itself.
import { useActionState, useId, useState } from 'react';
import { formatPaise, formatPercent, parsePercent, parseRupees } from '@/lib/money';
import { SPLIT_TYPES, splitExpense, type SplitPart, type SplitType } from '@/lib/split';
import type { ActionState } from '@/server/actions';
import { FormError, SubmitButton } from './forms';

type Member = { id: string; name: string };
export type ExpenseFormInitial = {
  description: string;
  amount: string;
  paidBy: string;
  spentOn: string;
  splitType: SplitType;
  included: string[];
  values: Record<string, string>;
  version: number;
};

const LABELS: Record<SplitType, { option: string; hint: string; input: string; unit: string }> = {
  equal: { option: 'Equally', hint: 'Everyone ticked pays the same; any leftover paise go to the first people in the list.', input: '', unit: '' },
  exact: { option: 'Exact amounts', hint: 'Type what each person owes. It must add up to the total.', input: 'Amount for', unit: '₹' },
  percent: { option: 'Percentages', hint: 'Type each person’s percentage. It must add up to 100%.', input: 'Percentage for', unit: '%' },
  shares: { option: 'Shares', hint: 'Give each person a number of shares, like 2 for a couple.', input: 'Shares for', unit: '×' },
};

function readValue(type: SplitType, raw: string): number | null {
  if (type === 'equal') return 0;
  if (type === 'exact') return parseRupees(raw);
  if (type === 'percent') return parsePercent(raw);
  return /^\d{1,4}$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

export function ExpenseForm({
  action,
  members,
  initial,
  conflictHref,
  submitLabel,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  members: Member[];
  initial: ExpenseFormInitial;
  conflictHref: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [amount, setAmount] = useState(initial.amount);
  const [splitType, setSplitType] = useState<SplitType>(initial.splitType);
  const [included, setIncluded] = useState(() => new Set(initial.included));
  // Values per split type, so switching type and back keeps what was typed.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial.values).map(([memberId, v]) => [`${initial.splitType}:${memberId}`, v])),
  );
  const ids = { description: useId(), amount: useId(), paidBy: useId(), spentOn: useId(), hint: useId() };

  const valueOf = (memberId: string) => values[`${splitType}:${memberId}`] ?? (splitType === 'shares' ? '1' : '');
  const total = parseRupees(amount);
  const parts: SplitPart[] = [];
  let unreadable = false;
  for (const m of members) {
    if (!included.has(m.id)) continue;
    const value = readValue(splitType, valueOf(m.id));
    if (value === null) unreadable = true;
    parts.push({ memberId: m.id, value: value ?? 0 });
  }
  const preview = total && !unreadable ? splitExpense(total, splitType, parts) : null;
  const previewOf = new Map(preview?.ok ? preview.shares.map((s) => [s.memberId, s.paise]) : []);

  let summary = '';
  if (!total) summary = 'Enter the amount to see the split.';
  else if (unreadable) summary = 'Some values aren’t numbers yet.';
  else if (splitType === 'exact') {
    const assigned = parts.reduce((a, p) => a + p.value, 0);
    summary = `Assigned ${formatPaise(assigned)} of ${formatPaise(total)}${assigned === total ? '.' : ` · ${formatPaise(total - assigned)} left`}`;
  } else if (splitType === 'percent') {
    summary = `Assigned ${formatPercent(parts.reduce((a, p) => a + p.value, 0))} of 100%`;
  } else if (preview && !preview.ok) summary = preview.error;
  else summary = `${formatPaise(total)} split ${splitType === 'equal' ? 'equally' : 'by shares'} between ${parts.length} ${parts.length === 1 ? 'person' : 'people'}.`;

  return (
    <form action={formAction} className="stack expense-form">
      <input type="hidden" name="version" value={initial.version} />
      {state?.conflict ? (
        <div className="form-error" role="alert">
          <p>{state.error}</p>
          <p>
            <a href={conflictHref}>Load the latest version</a>
          </p>
        </div>
      ) : (
        <FormError state={state} />
      )}

      <div className="field">
        <label htmlFor={ids.description}>What was it?</label>
        <input id={ids.description} name="description" required maxLength={80} defaultValue={initial.description} placeholder="Dinner at the beach shack" autoComplete="off" />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={ids.amount}>Amount (₹)</label>
          <input
            id={ids.amount}
            name="amount"
            required
            inputMode="decimal"
            className="money-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor={ids.spentOn}>Date</label>
          <input id={ids.spentOn} name="spentOn" type="date" required defaultValue={initial.spentOn} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={ids.paidBy}>Paid by</label>
        <select id={ids.paidBy} name="paidBy" defaultValue={initial.paidBy}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="choices split-types">
        <legend>Split</legend>
        {SPLIT_TYPES.map((type) => (
          <label key={type} className="choice">
            <input type="radio" name="splitType" value={type} checked={splitType === type} onChange={() => setSplitType(type)} /> {LABELS[type].option}
          </label>
        ))}
      </fieldset>

      <fieldset className="participants" aria-describedby={ids.hint}>
        <legend>Between</legend>
        <p id={ids.hint} className="fine-print">
          {LABELS[splitType].hint}
        </p>
        <ul className="participant-list">
          {members.map((m) => {
            const on = included.has(m.id);
            const share = previewOf.get(m.id);
            return (
              <li key={m.id} className={on ? 'participant' : 'participant participant-off'}>
                <label className="choice">
                  <input
                    type="checkbox"
                    name={`in.${m.id}`}
                    checked={on}
                    onChange={(e) => {
                      const next = new Set(included);
                      if (e.target.checked) next.add(m.id);
                      else next.delete(m.id);
                      setIncluded(next);
                    }}
                  />{' '}
                  {m.name}
                </label>
                {splitType === 'equal' ? null : (
                  <span className="unit-input">
                    <span aria-hidden="true">{LABELS[splitType].unit}</span>
                    <input
                      name={`v.${m.id}`}
                      aria-label={`${LABELS[splitType].input} ${m.name}`}
                      inputMode={splitType === 'shares' ? 'numeric' : 'decimal'}
                      disabled={!on}
                      value={valueOf(m.id)}
                      onChange={(e) => setValues({ ...values, [`${splitType}:${m.id}`]: e.target.value })}
                      autoComplete="off"
                    />
                  </span>
                )}
                <span className="amount participant-share">{on && share !== undefined ? formatPaise(share) : on ? '—' : 'not in'}</span>
              </li>
            );
          })}
        </ul>
        <p className="split-summary" aria-live="polite">
          {summary}
        </p>
      </fieldset>

      <div className="inline-form-row">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
