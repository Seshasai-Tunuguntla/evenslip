import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    // Sign-in cookies belong to the domain sign-in starts on, and GitHub returns to evenslip.vercel.app,
    // so Vercel's team alias sends everyone to the main address (path and query kept).
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'evenslip-seshasais-projects.vercel.app' }],
        destination: 'https://evenslip.vercel.app/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // The invite token is in the path: never send it on as a referrer, never index the page.
        source: '/join/:token',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
