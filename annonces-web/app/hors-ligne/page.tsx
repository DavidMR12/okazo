import type { Metadata } from 'next';
import Link from 'next/link';
import { RecentlyViewed } from '@/components/RecentlyViewed';

export const metadata: Metadata = { title: 'Hors ligne', robots: { index: false } };

// Page affichée par le service worker quand une page jamais consultée est demandée sans réseau
export default function OfflinePage() {
  return (
    <>
      <div className="narrow stack">
        <h1>Pas de connexion</h1>
        <p>Cette page n’a pas encore été consultée sur cet appareil. Les articles que vous avez déjà ouverts restent disponibles.</p>
        <Link href="/" className="btn btn-secondary">Retour à l’accueil</Link>
      </div>
      <div className="container"><RecentlyViewed /></div>
    </>
  );
}
