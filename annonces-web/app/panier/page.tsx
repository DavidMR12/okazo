'use client';

/* eslint-disable @next/next/no-img-element -- miniatures déjà optimisées (WebP) et servies par le CDN */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ImageIcon } from '@/components/icons';
import { PriceTag } from '@/components/PriceTag';
import { setInCart } from '@/lib/cart';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { formatXaf, listingPath } from '@/lib/format';
import type { PriceType } from '@/lib/types';

interface CartItem { id: string; title: string; priceType: PriceType; priceXaf: number | null; priceUnit: string | null; city: string; available: boolean; thumbnailUrl: string | null }
interface CartSeller { seller: { id: string; displayName: string; verificationLevel: 'phone' | 'identity' }; items: CartItem[]; total: number }
interface Cart { sellers: CartSeller[]; count: number; total: number }

/** Panier : liste d'achats regroupée par vendeur. Aucun paiement sur le site : on écrit à chaque vendeur. */
export default function CartPage() {
  const signedIn = useSignedIn();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCart(await call<Cart>('/me/cart'));
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Impossible de charger votre panier.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement voulu à l’affichage
    if (signedIn) void load();
  }, [signedIn, load]);

  const remove = async (id: string) => {
    try {
      await setInCart(id, false);
      await load();
    } catch {
      setError('Action impossible.');
    }
  };

  // Un message qui reprend tous les articles encore disponibles de ce vendeur
  const writeHref = (g: CartSeller) => {
    const items = g.items.filter((i) => i.available);
    const list = items.map((i) => `« ${i.title} »`).join(', ');
    const message = items.length === 1
      ? `Bonjour, votre annonce ${list} est-elle toujours disponible ?`
      : `Bonjour, je suis intéressé(e) par vos annonces ${list}. Sont-elles toujours disponibles ?`;
    return `/messages/nouveau?${new URLSearchParams({ annonce: items[0].id, titre: items[0].title, message })}`;
  };

  if (signedIn === false) {
    return (
      <div className="narrow stack">
        <h1>Votre panier</h1>
        <p>Connectez-vous, puis ajoutez des articles au panier pour les retrouver ici et contacter les vendeurs.</p>
        <Link href="/connexion?retour=/panier" className="btn">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="container section stack" style={{ maxWidth: 760 }}>
      <h1>Votre panier</h1>
      <p className="muted">Aucun paiement sur le site : écrivez à chaque vendeur et payez à la remise de l’article, après l’avoir vérifié.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {!cart ? <p className="muted">Chargement…</p> : null}
      {cart && !cart.count ? (
        <div className="stack">
          <p>Votre panier est vide. Cliquez sur « Ajouter au panier » sur une annonce pour la retrouver ici.</p>
          <p><Link href="/" className="btn btn-secondary">Voir les annonces</Link></p>
        </div>
      ) : null}

      {cart?.sellers.map((g) => (
        <section key={g.seller.id} className="panel stack" aria-label={`Articles de ${g.seller.displayName}`}>
          <Link href={`/vendeur/${g.seller.id}`} className="seller">
            <strong>{g.seller.displayName}</strong>
            {g.seller.verificationLevel === 'identity' ? <span className="verified">Identité vérifiée</span> : null}
          </Link>
          <ul className="my-list">
            {g.items.map((i) => (
              <li key={i.id} className="my-item" style={{ opacity: i.available ? 1 : 0.5 }}>
                {i.thumbnailUrl ? <img src={i.thumbnailUrl} alt="" width={64} height={64} className="inbox-thumb" /> : <span className="inbox-thumb card-thumb-empty" aria-hidden><ImageIcon size={22} /></span>}
                <span className="stack" style={{ gap: 4 }}>
                  <Link href={listingPath(i)}>{i.title}</Link>
                  {i.available ? <PriceTag priceType={i.priceType} priceXaf={i.priceXaf} unit={i.priceUnit} /> : <span className="muted">Plus disponible</span>}
                </span>
                <span className="my-actions">
                  <button type="button" className="link-button" onClick={() => void remove(i.id)}>Retirer</button>
                </span>
              </li>
            ))}
          </ul>
          {g.total ? <p style={{ margin: 0, textAlign: 'right' }}>Total : <strong>{formatXaf(g.total)}</strong></p> : null}
          {g.items.some((i) => i.available) ? <Link href={writeHref(g)} className="btn btn-secondary">Écrire au vendeur</Link> : null}
        </section>
      ))}

      {cart && cart.sellers.length > 1 && cart.total ? (
        <p style={{ textAlign: 'right', fontSize: '1.1rem' }}>Total du panier : <strong>{formatXaf(cart.total)}</strong></p>
      ) : null}
    </div>
  );
}
