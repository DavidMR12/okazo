'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useSignedIn } from '@/lib/client';
import { toggleFavorite, useFavoriteIds } from '@/lib/favorites';
import { HeartIcon } from './icons';

/** Cœur des cartes d'annonce. Hors connexion : passe par la connexion, puis ajoute le favori au retour. */
export function CardHeart({ listingId, title }: { listingId: string; title: string }) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const pathname = usePathname();
  const on = useFavoriteIds().has(listingId);

  const onClick = () => {
    if (!signedIn) {
      const back = `${pathname}${window.location.search ? `${window.location.search}&` : '?'}action=favori&annonce=${listingId}`;
      router.push(`/connexion?retour=${encodeURIComponent(back)}`);
      return;
    }
    void toggleFavorite(listingId);
  };

  return (
    <button
      type="button"
      className={`card-heart${on ? ' on' : ''}`}
      aria-pressed={on}
      aria-label={on ? `Retirer « ${title} » des favoris` : `Ajouter « ${title} » aux favoris`}
      onClick={onClick}
    >
      <HeartIcon filled={on} />
    </button>
  );
}
