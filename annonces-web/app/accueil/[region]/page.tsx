import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HomePage } from '@/components/HomePage';
import { getCountries } from '@/lib/api';
import { parseRegion } from '@/lib/region';

export const revalidate = 60;

/** Adresse interne : « / » y est réécrit par proxy.ts selon la région du visiteur (une page en cache par ville). */
export const metadata: Metadata = { alternates: { canonical: '/' }, robots: { index: false, follow: true } };

export default async function RegionHome({ params }: { params: Promise<{ region: string }> }) {
  const r = parseRegion(decodeURIComponent((await params).region));
  const country = r && (await getCountries()).find((c) => c.code.toLowerCase() === r.country);
  if (!country) return notFound();
  return <HomePage country={country} citySlug={r.city} />;
}
