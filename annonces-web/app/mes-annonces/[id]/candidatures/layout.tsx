import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Page personnelle du recruteur : jamais indexée.
export const metadata: Metadata = { title: 'Candidatures reçues', robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
