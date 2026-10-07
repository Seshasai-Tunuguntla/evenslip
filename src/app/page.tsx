import { redirect } from 'next/navigation';
import { githubEnabled } from '@/auth';
import { signInAsDemo, signInWithGithub } from '@/server/authActions';
import { hasDatabase } from '@/server/env';
import { currentUser } from '@/server/guard';

const sample = [
  ['Flights to Goa', '₹28,500.00'],
  ['Villa, 3 nights', '₹21,000.00'],
  ['Beach shack dinner', '₹4,860.00'],
  ['Dudhsagar jeep', '₹6,000.00'],
] as const;

export default async function Home({ searchParams }: PageProps<'/'>) {
  const ready = hasDatabase();
  if (ready && (await currentUser())) redirect('/dashboard');
  const { error } = await searchParams;
  return (
    <main id="main" className="page">
      <div className="receipt-wrap narrow">
        <article className="receipt" aria-labelledby="hero-title">
          <p className="eyebrow">Split the bill</p>
          <h1 id="hero-title">Who owes whom, settled in the fewest payments.</h1>
          <p>
            Add what everyone paid on a trip or in a shared flat. Evenslip works out the balances and the shortest way to
            settle them, and you mark each payment as paid.
          </p>
          <hr className="rule" />
          <ul className="lines" aria-label="A sample receipt">
            {sample.map(([what, amount]) => (
              <li key={what} className="line">
                <span>{what}</span>
                <span className="leader" aria-hidden="true" />
                <span className="amount">{amount}</span>
              </li>
            ))}
          </ul>
          <hr className="rule" />
          <p className="callout">
            5 friends, 12 expenses. Paying the biggest debt first takes <strong>4 payments</strong>. Evenslip finds{' '}
            <strong>3</strong>.
          </p>
          {error ? (
            <p className="form-error" role="alert">
              Sign-in didn&apos;t work. Please try again.
            </p>
          ) : null}
          {ready ? (
            <div className="stack-sm">
              <form action={signInAsDemo}>
                <button type="submit" className="button button-wide">
                  Try the demo
                </button>
              </form>
              {githubEnabled ? (
                <form action={signInWithGithub}>
                  <button type="submit" className="button button-ghost button-wide">
                    Sign in with GitHub
                  </button>
                </form>
              ) : (
                <p className="fine-print">GitHub sign-in is being set up; the demo works now.</p>
              )}
              <p className="fine-print">The demo is shared with other visitors and resets itself every 30 minutes.</p>
            </div>
          ) : (
            <p className="form-error" role="alert">
              This deployment has no database, so sign-in is off.
            </p>
          )}
        </article>
      </div>
    </main>
  );
}
