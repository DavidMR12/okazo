import type { Metadata } from 'next';
import { MyListings } from './MyListings';

export const metadata: Metadata = { title: 'Mes annonces', robots: { index: false } };

export default async function MyListingsPage({ searchParams }: { searchParams: Promise<{ publiee?: string; modifiee?: string }> }) {
  const { publiee, modifiee } = await searchParams;
  return <MyListings justPublished={publiee === '1'} justEdited={modifiee === '1'} />;
}
