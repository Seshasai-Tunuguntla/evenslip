import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SITE_URL } from '@/lib/site';
import { signOutNow } from '@/server/authActions';
import { hasDatabase } from '@/server/env';
import { currentUser } from '@/server/guard';
import './tokens.css';
import './globals.css';

const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-plex-mono' });

const title = 'Evenslip: split the bill, settle in fewer payments';
const description = 'Add shared expenses for a trip or a flat, see who owes whom, and settle up in the fewest payments.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: '%s · Evenslip' },
  description,
  openGraph: { type: 'website', url: '/', siteName: 'Evenslip', title, description, images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'The Goa trip receipt: balances and the three payments that settle everyone' }] },
  twitter: { card: 'summary_large_image', title, description, images: ['/og-image.png'] },
};

export const viewport: Viewport = { themeColor: '#1d3b8b' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = hasDatabase() ? await currentUser() : null;
  return (
    <html lang="en-IN" className={plexMono.variable}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <Link href={user ? '/dashboard' : '/'} className="brand">
            EVEN<span>SLIP</span>
          </Link>
          {user ? (
            <form action={signOutNow} className="site-user">
              <span>
                {user.name}
                {user.isDemo ? ' (demo)' : ''}
              </span>
              <button type="submit" className="desk-button">
                Sign out
              </button>
            </form>
          ) : null}
        </header>
        {children}
        <footer className="site-footer">
          <p>
            Money in whole paise · settle-up by exact minimum ·{' '}
            <a href="https://github.com/Seshasai-Tunuguntla/evenslip">source on GitHub</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
