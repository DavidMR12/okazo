import type { Metadata } from 'next';
import { getCategories, getCities, getCountries } from '@/lib/api';
import type { City } from '@/lib/types';
import { PublishForm } from './PublishForm';

export const metadata: Metadata = { title: 'Vendez votre article', robots: { index: false } };
export const revalidate = 3600;

// Catégories et villes préparées côté serveur : le formulaire s'affiche sans attendre l'API
export default async function PublishPage() {
  const [categories, countries] = await Promise.all([getCategories(), getCountries()]);
  const entries = await Promise.all(countries.map(async (c) => [c.code, await getCities(c.code)] as [string, City[]]));
  const walletsByCountry = Object.fromEntries(countries.map((c) => [c.code, c.wallets ?? []]));
  return <PublishForm categories={categories} citiesByCountry={Object.fromEntries(entries)} walletsByCountry={walletsByCountry} />;
}
