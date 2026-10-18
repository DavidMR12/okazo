'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PriceTag } from '@/components/PriceTag';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { listingPath } from '@/lib/format';
import type { ListingStatus, PriceType } from '@/lib/types';

interface Mine {
  id: string;
  title: string;
  adType: 'offer' | 'request';
  status: ListingStatus;
  rejectionReason: string | null;
  priceType: PriceType;
  priceXaf: number | null;
  thumbnailUrl: string | null;
  parentSlug: string | null; // « emploi » : offres avec candidatures
  applications: number;
  newApplications: number;
}

const STATUS: Record<ListingStatus, { label: string; className: string }> = {
  active: { label: 'En ligne', className: 'status-ok' },
  pending_review: { label: 'En cours de vérification', className: 'status-wait' },
  rejected: { label: 'Refusée', className: 'status-ko' },
  sold: { label: 'Vendue', className: 'status-off' },
  expired: { label: 'Expirée', className: 'status-off' },
  draft: { label: 'Brouillon', className: 'status-off' },
  removed: { label: 'Supprimée', className: 'status-off' },
};

export function MyListings({ justPublished, justEdited }: { justPublished: boolean; justEdited: boolean }) {
  const signedIn = useSignedIn();
  const [items, setItems] = useState<Mine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    call<{ items: Mine[] }>('/me/listings')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ClientError ? e.message : 'Chargement impossible.'));
  }, []);
  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);

  // Tant qu'une annonce est en vérification, on relit son statut toutes les 20 s
  useEffect(() => {
    if (!items?.some((i) => i.status === 'pending_review')) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [items, load]);

  const act = async (item: Mine, action: 'sold' | 'delete') => {
    const question = action === 'sold' ? `Marquer « ${item.title} » comme vendue ?` : `Supprimer « ${item.title} » ?`;
    if (!window.confirm(question)) return;
    try {
      if (action === 'sold') await call(`/listings/${item.id}/mark-sold`, { method: 'POST' });
      else await call(`/listings/${item.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Action impossible.');
    }
  };

  if (signedIn === false) {
    return (
      <div className="narrow stack">
        <h1>Mes annonces</h1>
        <Link className="btn" href="/connexion?retour=/mes-annonces">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="container section stack">
      <div className="publish-title">
        <h1>Mes annonces</h1>
        <Link href="/publier" className="btn">Publier une annonce</Link>
      </div>
      {justPublished ? (
        <p className="success" role="status">Annonce envoyée. Elle sera en ligne après une vérification rapide ; son statut se met à jour sur cette page.</p>
      ) : null}
      {justEdited ? <p className="success" role="status">Modifications envoyées. L’annonce repasse par une vérification rapide ; son statut se met à jour sur cette page.</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {items === null && !error ? <p className="muted">Chargement…</p> : null}
      {items?.length === 0 ? <p className="muted">Vous n’avez pas encore d’annonce.</p> : null}
      <ul className="my-list">
        {items?.map((item) => {
          const s = STATUS[item.status];
          const visible = item.status === 'active' || item.status === 'sold';
          return (
            <li key={item.id} className="my-item">
              {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" width={80} height={80} className="card-thumb" style={{ width: 80, height: 80 }} /> : <span className="card-thumb" style={{ width: 80, height: 80 }} />}
              <div className="card-body">
                {visible ? <Link href={listingPath(item)} className="card-title">{item.title}</Link> : <span className="card-title">{item.title}</span>}
                <PriceTag priceType={item.priceType} priceXaf={item.priceXaf} />
                <span className={`status ${s.className}`}>{s.label}</span>
                {item.status === 'rejected' && item.rejectionReason ? <span className="muted">{item.rejectionReason}</span> : null}
                {item.parentSlug === 'emploi' && item.adType === 'offer' ? (
                  <Link href={`/mes-annonces/${item.id}/candidatures`} className="apps-link">
                    {item.applications ? `${item.applications} candidature${item.applications > 1 ? 's' : ''}` : 'Aucune candidature'}
                    {item.newApplications ? ` · ${item.newApplications} nouvelle${item.newApplications > 1 ? 's' : ''}` : ''} ›
                  </Link>
                ) : null}
              </div>
              <div className="my-actions">
                {['active', 'rejected', 'expired'].includes(item.status) ? (
                  <Link href={`/mes-annonces/${item.id}/modifier`} className="btn btn-secondary btn-sm">{item.status === 'expired' ? 'Republier' : item.status === 'rejected' ? 'Corriger' : 'Modifier'}</Link>
                ) : null}
                {item.status === 'active' ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => void act(item, 'sold')}>Vendue</button> : null}
                <button type="button" className="link-button" onClick={() => void act(item, 'delete')}>Supprimer</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
