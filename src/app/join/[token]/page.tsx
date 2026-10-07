import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { githubEnabled } from '@/auth';
import { JoinForm } from '@/components/forms';
import { joinGroup } from '@/server/actions';
import { signInWithGithub } from '@/server/authActions';
import { currentUser } from '@/server/guard';
import { findInvite } from '@/server/invites';
import { groupMembers } from '@/server/ledger';

export const metadata: Metadata = { title: 'Join a group', robots: { index: false, follow: false } };

export default async function Join({ params }: PageProps<'/join/[token]'>) {
  const { token } = await params;
  const invite = await findInvite(token);
  if (!invite) notFound();
  const user = await currentUser();
  if (user && (await groupMembers([invite.groupId])).some((m) => m.userId === user.id)) redirect(`/groups/${invite.groupId}`);
  return (
    <main id="main" className="page">
      <div className="receipt-wrap narrow">
        <article className="receipt" aria-labelledby="join-title">
          <p className="eyebrow">You&apos;re invited</p>
          <h1 id="join-title">Join {invite.groupName}</h1>
          {!user ? (
            githubEnabled ? (
              <form action={signInWithGithub}>
                <input type="hidden" name="redirectTo" value={`/join/${token}`} />
                <p>Sign in to join and see the group&apos;s expenses.</p>
                <button type="submit" className="button button-wide">
                  Sign in with GitHub
                </button>
              </form>
            ) : (
              <p>Sign-in isn&apos;t set up on this site yet, so you can&apos;t join for now.</p>
            )
          ) : user.isDemo ? (
            <p className="notice">The demo account can&apos;t join groups. Sign out, then sign in with GitHub to join.</p>
          ) : (
            <JoinForm action={joinGroup.bind(null, token)} placeholders={invite.placeholders} groupName={invite.groupName} />
          )}
        </article>
      </div>
    </main>
  );
}
