import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Retour de paiement : jamais indexée.
export const metadata: Metadata = { title: 'Paiement', robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
