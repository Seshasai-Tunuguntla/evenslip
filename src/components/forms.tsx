'use client';
// Small forms around Server Actions: each shows the action's error (if any) next to its button.
import { useActionState, useId, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/server/actions';

type FormAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

export function SubmitButton({ children, pending, className = 'button', ...rest }: { children: ReactNode; pending?: string; className?: string; 'aria-label'?: string }) {
  const status = useFormStatus();
  return (
    <button type="submit" className={className} disabled={status.pending} aria-disabled={status.pending} {...rest}>
      {status.pending ? (pending ?? 'Saving…') : children}
    </button>
  );
}

export function FormError({ state }: { state: ActionState }) {
  return state?.error ? (
    <p className="form-error" role="alert">
      {state.error}
    </p>
  ) : null;
}

/** A labelled one-line text form: new group, new placeholder member. */
export function NameForm({ action, label, button, placeholder, maxLength }: { action: FormAction; label: string; button: string; placeholder: string; maxLength: number }) {
  const [state, formAction] = useActionState(action, null);
  const id = useId();
  return (
    <form action={formAction} className="inline-form">
      <label htmlFor={id}>{label}</label>
      <div className="inline-form-row">
        <input id={id} name="name" required maxLength={maxLength} placeholder={placeholder} autoComplete="off" />
        <SubmitButton pending="Adding…">{button}</SubmitButton>
      </div>
      <FormError state={state} />
    </form>
  );
}

export function InviteLink({ action }: { action: FormAction }) {
  const [state, formAction] = useActionState(action, null);
  const [copied, setCopied] = useState(false);
  const id = useId();
  const url = state?.invitePath && typeof window !== 'undefined' ? `${window.location.origin}${state.invitePath}` : null;
  return (
    <form action={formAction} className="stack-sm">
      {url ? (
        <>
          <label htmlFor={id}>Invite link (shown once: copy it now)</label>
          <div className="inline-form-row">
            <input id={id} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="button"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="fine-print" aria-live="polite">
            Anyone signed in with this link can join for 7 days. A new link turns this one off.
          </p>
        </>
      ) : null}
      <SubmitButton className="button button-ghost" pending="Making a link…">
        {url ? 'Make a new link' : 'Create invite link'}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}

export function MarkPaidForm({ action, from, to, paise, label }: { action: FormAction; from: string; to: string; paise: number; label: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="mark-paid">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="paise" value={paise} />
      <SubmitButton className="button button-small" pending="Recording…" aria-label={`Mark as paid: ${label}`}>
        Mark as paid
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}

export function UndoPaymentForm({ action, label }: { action: FormAction; label: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction}>
      <SubmitButton className="link-button" pending="Undoing…" aria-label={`Undo: ${label}`}>
        Undo
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}

export function DeleteExpenseForm({ action, version }: { action: FormAction; version: number }) {
  const [state, formAction] = useActionState(action, null);
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={formAction} className="stack-sm">
      <input type="hidden" name="version" value={version} />
      {confirming ? (
        <div className="inline-form-row">
          <SubmitButton className="button button-danger" pending="Deleting…">
            Yes, delete it
          </SubmitButton>
          <button type="button" className="button button-ghost" onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </div>
      ) : (
        <button type="button" className="button button-ghost" onClick={() => setConfirming(true)}>
          Delete expense…
        </button>
      )}
      <FormError state={state} />
    </form>
  );
}

export function JoinForm({ action, placeholders, groupName }: { action: FormAction; placeholders: { id: string; name: string }[]; groupName: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="stack">
      {placeholders.length > 0 ? (
        <fieldset className="choices">
          <legend>Are you already on the list?</legend>
          <label className="choice">
            <input type="radio" name="claim" value="" defaultChecked /> No, join as a new member
          </label>
          {placeholders.map((p) => (
            <label key={p.id} className="choice">
              <input type="radio" name="claim" value={p.id} /> I&apos;m {p.name}
            </label>
          ))}
        </fieldset>
      ) : null}
      <SubmitButton pending="Joining…">Join {groupName}</SubmitButton>
      <FormError state={state} />
    </form>
  );
}
