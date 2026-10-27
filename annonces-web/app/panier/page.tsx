'use client';

/* eslint-disable @next/next/no-img-element -- miniatures déjà optimisées (WebP) et servies par le CDN */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { cartOutline, chatbubbleEllipsesOutline, imageOutline, locationOutline, searchOutline, shieldCheckmark, shieldCheckmarkOutline, trashOutline } from 'ionicons/icons';
import { DECOR_CART, Decor } from '@/components/Decor';
import { Ion } from '@/components/Ion';
import { PriceTag } from '@/components/PriceTag';
import { setInCart } from '@/lib/cart';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { formatXaf, listingPath } from '@/lib/format';
import type { PriceType } from '@/lib/types';

interface CartItem { id: string; title: string; priceType: PriceType; priceXaf: number | null; priceUnit: string | null; city: string; available: boolean; thumbnailUrl: string | null }
interface CartSeller { seller: { id: string; displayName: string; verificationLevel: 'phone' | 'identity' }; items: CartItem[]; total: number }
interface Cart { sellers: CartSeller[]; count: number; total: number }

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

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
      <div className="account">
        <h1 className="pill-title">Votre panier</h1>
        <div className="empty-card empty-tall">
          <Decor icons={DECOR_CART} />
          <span className="empty-halo"><span className="empty-icon"><Ion icon={cartOutline} size={34} /></span></span>
          <p>Connectez-vous, puis ajoutez des articles au panier pour les retrouver ici et contacter les vendeurs.</p>
          <Link href="/connexion?retour=/panier" className="btn">Se connecter</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="account">
      <div className="page-head">
        <h1 className="pill-title">Votre panier</h1>
        {cart?.count ? <span className="count-badge">{cart.count} article{cart.count > 1 ? 's' : ''}</span> : null}
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {!cart && !error ? <p className="muted">Chargement…</p> : null}
      {cart && !cart.count ? (
        <div className="empty-card empty-tall">
          <Decor icons={DECOR_CART} />
          <span className="empty-halo"><span className="empty-icon"><Ion icon={cartOutline} size={34} /></span></span>
          <p>Votre panier est vide. Cliquez sur « Ajouter au panier » sur une annonce pour la retrouver ici.</p>
          <Link href="/" className="btn btn-secondary"><Ion icon={searchOutline} size={18} /> Voir les annonces</Link>
        </div>
      ) : null}

      {cart?.sellers.map((g) => (
        <section key={g.seller.id} className="detail-card" aria-label={`Articles de ${g.seller.displayName}`}>
          <Link href={`/vendeur/${g.seller.id}`} className="detail-band seller-band">
            <span className="detail-icon seller-initials" aria-hidden>{initials(g.seller.displayName)}</span>
            <span className="seller-band-text">
              <strong>{g.seller.displayName}</strong>
              <span>{g.items.length} article{g.items.length > 1 ? 's' : ''} de ce vendeur</span>
            </span>
            {g.seller.verificationLevel === 'identity' ? <span className="detail-chip"><Ion icon={shieldCheckmark} size={15} /> Identité vérifiée</span> : null}
          </Link>
          <ul className="item-list">
            {g.items.map((i) => (
              <li key={i.id} className={`item-row${i.available ? '' : ' unavailable'}`}>
                <Link href={listingPath(i)} className="item-link">
                  {i.thumbnailUrl ? <img src={i.thumbnailUrl} alt="" className="item-thumb" /> : <span className="item-thumb card-thumb-empty" aria-hidden><Ion icon={imageOutline} size={22} /></span>}
                  <span className="item-text">
                    <strong className="item-title">{i.title}</strong>
                    {i.available ? <PriceTag priceType={i.priceType} priceXaf={i.priceXaf} unit={i.priceUnit} /> : <span className="item-off">Plus disponible</span>}
                    <span className="item-meta"><Ion icon={locationOutline} size={14} /> {i.city}</span>
                  </span>
                </Link>
                <button type="button" className="icon-btn" onClick={() => void remove(i.id)} aria-label={`Retirer ${i.title} du panier`}><Ion icon={trashOutline} size={19} /></button>
              </li>
            ))}
          </ul>
          <div className="seller-foot">
            {g.total ? <span className="seller-total">Total <strong>{formatXaf(g.total)}</strong></span> : <span />}
            {g.items.some((i) => i.available) ? <Link href={writeHref(g)} className="btn"><Ion icon={chatbubbleEllipsesOutline} size={19} /> Écrire au vendeur</Link> : null}
          </div>
        </section>
      ))}

      {cart && cart.sellers.length > 1 && cart.total ? (
        <div className="cart-total"><span>Total du panier</span><strong>{formatXaf(cart.total)}</strong></div>
      ) : null}

      {cart?.count ? (
        <aside className="compose-safety">
          <span className="fact-icon"><Ion icon={shieldCheckmarkOutline} size={20} /></span>
          <span>
            <strong>Aucun paiement sur le site</strong>
            <span>Écrivez à chaque vendeur et payez à la remise de l’article, après l’avoir vérifié.</span>
          </span>
        </aside>
      ) : null}
    </div>
  );
}
