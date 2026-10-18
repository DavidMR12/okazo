import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReportForm } from './ReportForm';

export const metadata: Metadata = { title: 'Signaler', robots: { index: false } };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ annonce?: string; vendeur?: string }> }) {
  const { annonce, vendeur } = await searchParams;
  const listingId = annonce && UUID.test(annonce) ? annonce : undefined;
  const userId = !listingId && vendeur && UUID.test(vendeur) ? vendeur : undefined;
  if (!listingId && !userId) return notFound();
  const returnTo = listingId ? `/signaler?annonce=${listingId}` : `/signaler?vendeur=${userId}`;
  return (
    <div className="narrow">
      <ReportForm listingId={listingId} userId={userId} returnTo={returnTo} />
    </div>
  );
}
