import type { Metadata } from 'next';
import { DEFAULT_COUNTRY } from '@/lib/site';
import { ImageSearch } from './ImageSearch';

export const metadata: Metadata = { title: 'Rechercher par image', robots: { index: false } };

export default async function ImageSearchPage({ searchParams }: { searchParams: Promise<{ pays?: string }> }) {
  const { pays } = await searchParams;
  return <ImageSearch country={/^[a-z]{2}$/i.test(pays ?? '') ? pays! : DEFAULT_COUNTRY} />;
}
