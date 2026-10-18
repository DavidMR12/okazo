import type { Metadata } from 'next';
import { getCategories, getCities, getCountries } from '@/lib/api';
import type { City } from '@/lib/types';
import { EditListing } from './EditListing';

export const metadata: Metadata = { title: "Modifier l'annonce", robots: { index: false } };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [categories, countries] = await Promise.all([getCategories(), getCountries()]);
  const entries = await Promise.all(countries.map(async (c) => [c.code, await getCities(c.code)] as [string, City[]]));
  const walletsByCountry = Object.fromEntries(countries.map((c) => [c.code, c.wallets ?? []]));
  return <EditListing id={id} categories={categories} citiesByCountry={Object.fromEntries(entries)} walletsByCountry={walletsByCountry} />;
}
