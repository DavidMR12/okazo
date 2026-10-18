'use client';

import { useEffect } from 'react';
import { rememberListing, useRecent } from '@/lib/recent';
import type { ListingCard as Card } from '@/lib/types';
import { ListingCard } from './ListingCard';

/** Accueil : « Vous avez consulté », une rangée qui défile (rien ne s'affiche la première fois). */
export function RecentlyViewed() {
  const [items, clear] = useRecent();
  if (!items.length) return null;
  return (
    <section className="section stack" aria-labelledby="h-recent">
      <div className="section-head">
        <h2 id="h-recent">Vous avez consulté</h2>
        <button type="button" className="pill-btn" onClick={clear}>Effacer</button>
      </div>
      <div className="tile-row">
        {items.map((c) => (
          <ListingCard key={c.id} item={c} />
        ))}
      </div>
    </section>
  );
}

/** Page d'annonce : mémorise l'annonce consultée (dans ce navigateur uniquement). */
export function RememberListing({ card }: { card: Card }) {
  useEffect(() => {
    rememberListing(card);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);
  return null;
}
