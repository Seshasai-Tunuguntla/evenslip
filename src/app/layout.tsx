import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './tokens.css';
import './globals.css';

const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-plex-mono' });

export const metadata: Metadata = {
  title: 'Evenslip: split the bill, settle in fewer payments',
};

export const viewport: Viewport = { themeColor: '#1d3b8b' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={plexMono.variable}>
      <body>{children}</body>
    </html>
  );
}
