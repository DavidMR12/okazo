'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
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
      <div className="narrow stack">
        <h1>Vos favoris</h1>
        <p>Connectez-vous pour retrouver les annonces qui vous intéressent, sur le site comme sur l’application.</p>
        <Link href="/connexion?retour=/favoris" className="btn">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="container section stack">
      <h1>Vos favoris</h1>
      {state === 'loading' ? <p className="muted">Chargement…</p> : null}
      {state === 'error' ? <p className="error">Impossible de charger vos favoris. <button className="link-button" onClick={() => void load()}>Réessayer</button></p> : null}
      {state === 'ready' && !items.length ? <p className="muted">Aucun favori pour l’instant. Ajoutez-en depuis une annonce.</p> : null}
      <div className="listing-grid">
        {items.map((f) => (
          <div key={f.id} className="card" style={{ opacity: f.available ? 1 : 0.55 }}>
            <Link href={listingPath(f)} style={{ display: 'flex', gap: 12, textDecoration: 'none', flex: 1, minWidth: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {f.thumbnailUrl ? <img src={f.thumbnailUrl} alt="" width={104} height={104} className="card-thumb" loading="lazy" /> : <span className="card-thumb" />}
              <span className="card-body">
                <span className="card-title">{f.title}</span>
                {f.available ? <PriceTag priceType={f.priceType} priceXaf={f.priceXaf} /> : <strong className="muted">{f.status === 'sold' ? 'Vendue' : 'Indisponible'}</strong>}
                <span className="muted">{f.city}</span>
              </span>
            </Link>
            <button type="button" className="link-button" onClick={() => void remove(f.id)} aria-label={`Retirer ${f.title} des favoris`}>Retirer</button>
          </div>
        ))}
      </div>
      {cursor ? <button className="btn btn-secondary" onClick={() => void load(cursor)}>Voir plus</button> : null}
    </div>
  );
}
