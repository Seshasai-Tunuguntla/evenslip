// Auth.js: GitHub sign-in, and the one-click demo (a Credentials provider with no credentials).
// Sessions are signed JWT cookies holding only our own user id (token.sub); there's no session
// table. GitHub accounts are upserted into `users` on sign-in, without storing an email address.
import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import { prepareDemoSignIn } from '@/server/demo';
import { upsertGithubUser } from '@/server/users';

/** GitHub sign-in needs an OAuth app; without one the button is hidden and the demo still works. */
export const githubEnabled = Boolean(process.env['AUTH_GITHUB_ID'] && process.env['AUTH_GITHUB_SECRET']);

const providers: Provider[] = [
  Credentials({
    id: 'demo',
    name: 'Demo',
    credentials: {},
    // Rebuilds the demo first if it's 30+ minutes old, then signs in as its one account.
    authorize: async () => prepareDemoSignIn(),
  }),
];
if (githubEnabled) providers.push(GitHub);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/', error: '/' },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.provider === 'github') {
        token.sub = await upsertGithubUser({
          githubId: account.providerAccountId,
          name: user.name ?? 'GitHub user',
          image: user.image ?? null,
        });
        delete token.email;
      } else if (account?.provider === 'demo' && user.id) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
