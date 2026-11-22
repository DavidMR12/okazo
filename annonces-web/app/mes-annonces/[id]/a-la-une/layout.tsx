import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Page personnelle du vendeur : jamais indexée.
export const metadata: Metadata = { title: 'Mettre à la une', robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
