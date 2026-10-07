import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="page">
      <div className="receipt-wrap narrow">
        <article className="receipt">
          <p className="eyebrow">Error 404</p>
          <h1>Nothing to see here</h1>
          <p>This page doesn&apos;t exist, or it belongs to a group you&apos;re not a member of.</p>
          <p>
            <Link href="/dashboard">Back to your groups</Link>
          </p>
        </article>
      </div>
    </main>
  );
}
