'use client';

/* eslint-disable @next/next/no-img-element -- miniatures déjà optimisées (WebP) et servies par le CDN */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { heart, heartOutline, imageOutline, locationOutline, searchOutline } from 'ionicons/icons';
import { DECOR_FAVORITES, Decor, DecorFooter } from '@/components/Decor';
import { Ion } from '@/components/Ion';
import { PriceTag } from '@/components/PriceTag';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { listingPath } from '@/lib/format';
import type { ListingStatus, PriceType } from '@/lib/types';

interface Fav { id: string; title: string; priceType: PriceType; priceXaf: number | null; city: string; status: ListingStatus; available: boolean; thumbnailUrl: string | null }

export default function FavoritesPage() {
  const signedIn = useSignedIn();
  const [items, setItems] = useState<Fav[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async (after?: string) => {
    try {
      const r = await call<{ items: Fav[]; nextCursor: string | null }>(`/me/favorites${after ? `?cursor=${encodeURIComponent(after)}` : ''}`);
      setItems((prev) => (after ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor);
      setState('ready');
    } catch (e) {
      setState(e instanceof ClientError && e.status === 401 ? 'ready' : 'error');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement ou réinitialisation voulus à l’affichage
    if (signedIn) void load();
  }, [signedIn, load]);

  const remove = async (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await call(`/favorites/${id}`, { method: 'DELETE' }).catch(() => void load());
  };

  if (signedIn === false) {
    return (
      <div className="account">
        <h1 className="pill-title">Vos favoris</h1>
        <div className="empty-card empty-tall">
          <Decor icons={DECOR_FAVORITES} />
          <span className="empty-halo"><span className="empty-icon"><Ion icon={heartOutline} size={34} /></span></span>
          <p>Connectez-vous pour retrouver les annonces qui vous intéressent, sur le site comme sur l’application.</p>
          <Link href="/connexion?retour=/favoris" className="btn">Se connecter</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="account account-wide">
      <div className="page-head">
        <h1 className="pill-title">Vos favoris</h1>
        {items.length ? <span className="count-badge">{items.length} annonce{items.length > 1 ? 's' : ''}</span> : null}
      </div>
      {state === 'loading' ? <p className="muted">Chargement…</p> : null}
      {state === 'error' ? <p className="error">Impossible de charger vos favoris. <button className="link-button" onClick={() => void load()}>Réessayer</button></p> : null}
      {state === 'ready' && !items.length ? (
        <div className="empty-card empty-tall">
          <Decor icons={DECOR_FAVORITES} />
          <span className="empty-halo"><span className="empty-icon"><Ion icon={heartOutline} size={34} /></span></span>
          <p>Aucun favori pour l’instant. Touchez le cœur sur une annonce pour la garder ici.</p>
          <Link href="/" className="btn btn-secondary"><Ion icon={searchOutline} size={18} /> Voir les annonces</Link>
        </div>
      ) : null}
      {items.length ? (
        <ul className="fav-grid">
          {items.map((f) => (
            <li key={f.id} className={`fav-card${f.available ? '' : ' unavailable'}`}>
              <Link href={listingPath(f)} className="fav-link">
                <span className="fav-photo">
                  {f.thumbnailUrl ? <img src={f.thumbnailUrl} alt="" loading="lazy" /> : <span className="card-thumb-empty" aria-hidden><Ion icon={imageOutline} size={30} /></span>}
                  {!f.available ? <span className="fav-status">{f.status === 'sold' ? 'Vendue' : 'Indisponible'}</span> : null}
                </span>
                <span className="fav-body">
                  <strong className="item-title">{f.title}</strong>
                  {f.available ? <PriceTag priceType={f.priceType} priceXaf={f.priceXaf} /> : null}
                  <span className="item-meta"><Ion icon={locationOutline} size={14} /> {f.city}</span>
                </span>
              </Link>
              <button type="button" className="fav-heart" onClick={() => void remove(f.id)} aria-label={`Retirer ${f.title} des favoris`}><Ion icon={heart} size={20} /></button>
            </li>
          ))}
        </ul>
      ) : null}
      {items.length > 0 && items.length < 5 ? <DecorFooter icons={DECOR_FAVORITES} text="Touchez le cœur d’une annonce pour l’ajouter à vos favoris." /> : null}
      {cursor ? <button className="btn btn-secondary" onClick={() => void load(cursor)}>Voir plus</button> : null}
    </div>
  );
}
