'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { setInCart, useCartIds } from '@/lib/cart';
import { ClientError, useSignedIn } from '@/lib/client';

/** « Ajouter au panier » sur une annonce. Hors connexion : passe par la connexion puis revient sur l'annonce. */
export function CartButton({ listingId }: { listingId: string }) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const pathname = usePathname();
  const inCart = useCartIds().has(listingId);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (!signedIn) {
      router.push(`/connexion?retour=${encodeURIComponent(pathname)}`);
      return;
    }
    setError(null);
    try {
      await setInCart(listingId, !inCart);
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Action impossible.');
    }
  };

  return (
    <>
      <button type="button" className="btn btn-secondary" aria-pressed={inCart} onClick={() => void onClick()}>
        {inCart ? '✓ Dans votre panier' : 'Ajouter au panier'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </>
  );
}
