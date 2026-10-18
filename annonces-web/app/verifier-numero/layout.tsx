import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Page personnelle (vérification du numéro) : jamais indexée.
export const metadata: Metadata = { title: 'Vérifier mon numéro', robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
