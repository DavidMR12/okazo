import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { ReactNode } from 'react';

// Page personnelle (vérification du numéro) : jamais indexée.
export const metadata: Metadata = { title: 'Vérifier mon numéro', robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  // La page lit l'adresse (useSearchParams) : sans Suspense, la construction de production échoue
  return <Suspense>{children}</Suspense>;
}
