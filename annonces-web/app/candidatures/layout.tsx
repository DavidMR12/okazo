import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Page personnelle : jamais indexée.
export const metadata: Metadata = { title: 'Mes candidatures', robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
