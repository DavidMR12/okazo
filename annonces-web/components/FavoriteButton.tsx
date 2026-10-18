'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSignedIn } from '@/lib/client';
import { toggleFavorite, useFavoriteIds } from '@/lib/favorites';
import { withAction } from '@/lib/resume';

/**
 * « Ajouter aux favoris » de la page d'annonce. Même liste partagée que les cœurs des cartes : le bouton et
 * le cœur d'une même annonce restent d'accord. Hors connexion : `?action=favori&annonce=<id>` au retour, repris
 * par `lib/favorites` pour CETTE annonce (et non pour une autre annonce de la page).
 */
export function FavoriteButton({ listingId, returnTo }: { listingId: string; returnTo: string }) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const on = useFavoriteIds().has(listingId);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!signedIn) {
      router.push(`/connexion?retour=${encodeURIComponent(`${withAction(returnTo, 'favori')}&annonce=${listingId}`)}`);
      return;
    }
    setBusy(true);
    await toggleFavorite(listingId);
    setBusy(false);
  };

  return (
    <button type="button" className="btn btn-secondary" onClick={() => void toggle()} disabled={busy} aria-pressed={on}>
      {on ? '♥ Dans vos favoris' : '♡ Ajouter aux favoris'}
    </button>
  );
}
