'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { RuleBadges } from '@/components/admin/RuleBadges';
import { asHits, fmtDate } from '@/lib/admin';
import { call, ClientError } from '@/lib/client';
import { formatXaf } from '@/lib/format';

interface QueueItem {
  listingId: string;
  title: string;
  priceXaf: number | null;
  createdAt: string;
  sellerTrustScore: number;
  sellerVerification: 'phone' | 'identity';
  openReports: number;
  ruleHits: unknown;
  thumbnailUrl: string | null;
}

/** File des annonces en attente : règles déclenchées d'abord, puis vendeurs les moins fiables, puis les plus anciennes. */
export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    call<{ items: QueueItem[] }>('/admin/moderation/queue?limit=50')
      .then((r) => { setItems(r.items); setError(null); })
      .catch((e) => setError(e instanceof ClientError ? e.message : 'Chargement impossible.'));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // nouvelles annonces visibles sans recharger
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="stack">
      <div className="publish-title">
        <h1>Annonces à vérifier {items ? <span className="count">{items.length}</span> : null}</h1>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Actualiser</button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {items?.length === 0 ? <p className="success">Rien en attente. Les nouvelles annonces apparaissent ici automatiquement.</p> : null}
      <ul className="admin-list">
        {items?.map((it) => {
          const hits = asHits(it.ruleHits);
          return (
            <li key={it.listingId}>
              <Link href={`/admin/annonces/${it.listingId}`} className="admin-row" prefetch={false}>
                {it.thumbnailUrl ? <img src={it.thumbnailUrl} alt="" className="admin-thumb" /> : <span className="admin-thumb admin-thumb-empty">Photo en traitement</span>}
                <span className="admin-row-body">
                  <strong>{it.title}</strong>
                  <span className="muted">
                    {it.priceXaf !== null ? formatXaf(it.priceXaf) : 'Prix sur demande'}, déposée le {fmtDate(it.createdAt)}
                  </span>
                  <span className="muted">
                    Vendeur : confiance {it.sellerTrustScore}
                    {it.sellerVerification === 'identity' ? ', identité vérifiée' : ''}
                    {it.openReports ? `, ${it.openReports} signalement${it.openReports > 1 ? 's' : ''}` : ''}
                  </span>
                  <RuleBadges hits={hits} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
