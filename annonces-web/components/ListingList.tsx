import { Fragment } from 'react';
import { AD_SLOTS } from '@/lib/site';
import type { ListingCard as Card } from '@/lib/types';
import { AdSlot } from './AdSlot';
import { ListingCard } from './ListingCard';

/** Grille d'annonces (2 colonnes sur téléphone, 6 sur ordinateur), avec un emplacement publicitaire toutes les 12 annonces, soit deux rangées pleines sur ordinateur (jamais en tête de liste). */
export function ListingList({ items, row = false }: { items: Card[]; row?: boolean }) {
  // row : une rangée qui défile horizontalement (annonces similaires), sans publicité
  if (row) {
    return (
      <div className="tile-row">
        {items.map((item) => (
          <ListingCard key={item.id} item={item} />
        ))}
      </div>
    );
  }
  return (
    <div className="tile-grid">
      {items.map((item, i) => (
        <Fragment key={item.id}>
          <ListingCard item={item} eager={i < 4} />
          {(i + 1) % 12 === 0 && i < items.length - 1 ? (
            <div className="tile-ad">
              <AdSlot slot={AD_SLOTS.feed} />
            </div>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
