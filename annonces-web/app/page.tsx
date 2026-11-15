import { HomePage } from '@/components/HomePage';
import { getCountries } from '@/lib/api';
import { MAIN_CITY } from '@/lib/region';
import { DEFAULT_COUNTRY } from '@/lib/site';

export const revalidate = 60;

/**
 * Secours seulement : en temps normal, proxy.ts réécrit « / » vers /accueil/<région du visiteur>.
 * Affiche le pays par défaut si le relais n'a pas tourné.
 */
export default async function Home() {
  const countries = await getCountries();
  const country = countries.find((c) => c.code.toLowerCase() === DEFAULT_COUNTRY) ?? countries[0];
  if (!country) return null;
  return <HomePage country={country} citySlug={MAIN_CITY[country.code.toLowerCase()]} />;
}
