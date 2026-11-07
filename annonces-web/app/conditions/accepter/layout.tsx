import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = { title: 'Accepter les conditions', robots: { index: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  // La page lit l'adresse (useSearchParams) : sans Suspense, la construction de production échoue
  return <Suspense>{children}</Suspense>;
}
