'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { CANDIDATE_STATUS, MyApplication } from '@/lib/applications';
import { relativeTime } from '@/lib/format';

/** Mes candidatures : les offres auxquelles j'ai postulé, avec leur statut. */
export default function MyApplicationsPage() {
  const signedIn = useSignedIn();
  const [items, setItems] = useState<MyApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    call<{ items: MyApplication[] }>('/me/applications')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ClientError ? e.message : 'Impossible de charger vos candidatures.'));
  }, [signedIn]);

  if (signedIn === false) {
    return (
      <div className="narrow stack">
        <h1>Mes candidatures</h1>
        <p>Connectez-vous pour suivre vos candidatures.</p>
        <Link href="/connexion?retour=/candidatures" className="btn">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="container section stack" style={{ maxWidth: 760 }}>
      <h1>Mes candidatures</h1>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {!items && !error ? <p className="muted">Chargement…</p> : null}
      {items && !items.length ? <p>Aucune candidature. Dans la catégorie Emploi, ouvrez une offre et cliquez sur « Postuler ».</p> : null}
      <ul className="my-list">
        {items?.map((a) => {
          const s = CANDIDATE_STATUS[a.status];
          return (
            <li key={a.id} className="my-item">
              <span className="stack" style={{ gap: 4, flex: 1 }}>
                <Link href={a.conversationId ? `/messages/${a.conversationId}` : `/annonce/${a.listingId}`} className="card-title">{a.listingTitle}</Link>
                <span className="muted">
                  Envoyée {relativeTime(a.createdAt)}
                  {a.hasCv ? ' · CV joint' : ''}
                  {a.listingStatus !== 'active' ? ' · offre close' : ''}
                </span>
              </span>
              <span className={`badge ${s.className}`}>{s.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
