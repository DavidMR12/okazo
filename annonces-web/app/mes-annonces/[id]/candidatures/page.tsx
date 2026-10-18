'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { EMPLOYER_STATUS, ReceivedApplication } from '@/lib/applications';
import { memberSince, relativeTime } from '@/lib/format';

/** Candidatures reçues pour une offre d'emploi : lire, ouvrir le CV, répondre, retenir ou écarter. */
export default function ListingApplicationsPage() {
  const { id } = useParams<{ id: string }>();
  const signedIn = useSignedIn();
  const [data, setData] = useState<{ listing: { title: string }; items: ReceivedApplication[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    call<{ listing: { title: string }; items: ReceivedApplication[] }>(`/me/listings/${id}/applications`)
      .then(setData)
      .catch((e) => setError(e instanceof ClientError ? e.message : 'Impossible de charger les candidatures.'));
  }, [id]);

  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);

  // Lien de 5 minutes vers le CV (stockage privé). L'onglet est ouvert tout de suite, sinon le navigateur le bloquerait.
  const openCv = async (a: ReceivedApplication) => {
    const tab = window.open('', '_blank');
    try {
      const { url } = await call<{ url: string }>(`/me/applications/${a.id}/cv`);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      tab?.close();
      setError(e instanceof ClientError ? e.message : 'Impossible d’ouvrir le CV.');
    }
  };

  const decide = async (a: ReceivedApplication, status: 'shortlisted' | 'rejected') => {
    const next = a.status === status ? 'viewed' : status; // recliquer annule
    setData((d) => d && { ...d, items: d.items.map((x) => (x.id === a.id ? { ...x, status: next } : x)) });
    await call(`/me/applications/${a.id}`, { method: 'PATCH', body: { status: next } }).catch(() => load());
  };

  if (signedIn === false) {
    return (
      <div className="narrow stack">
        <h1>Candidatures</h1>
        <Link href={`/connexion?retour=/mes-annonces/${id}/candidatures`} className="btn">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="container section stack" style={{ maxWidth: 760 }}>
      <p style={{ margin: 0 }}><Link href="/mes-annonces">‹ Mes annonces</Link></p>
      <h1>Candidatures{data ? ` (${data.items.length})` : ''}</h1>
      {data ? <p className="muted listing-title" style={{ margin: 0 }}>{data.listing.title}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {!data && !error ? <p className="muted">Chargement…</p> : null}
      {data && !data.items.length ? <p>Pas encore de candidature. Chaque nouvelle candidature arrive aussi dans votre messagerie.</p> : null}
      {data?.items.map((a) => {
        const s = EMPLOYER_STATUS[a.status];
        return (
          <article key={a.id} className="app-card">
            <div className="app-head">
              <span className="app-avatar" aria-hidden>{a.applicant.displayName.slice(0, 1).toUpperCase()}</span>
              <div style={{ flex: 1 }}>
                <strong>{a.applicant.displayName}</strong>
                {a.applicant.verificationLevel === 'identity' ? <span className="verified"> ✓ Identité vérifiée</span> : null}
                <div className="muted">{memberSince(a.applicant.memberSince)} · reçue {relativeTime(a.createdAt)}</div>
              </div>
              <span className={`badge ${s.className}`}>{s.label}</span>
            </div>
            <p className="app-message">{a.message}</p>
            {a.hasCv ? (
              <button type="button" className="link-button" style={{ alignSelf: 'flex-start' }} onClick={() => void openCv(a)}>
                Voir le CV ({a.cvContentType === 'application/pdf' ? 'PDF' : 'photo'})
              </button>
            ) : <span className="muted">Pas de CV joint</span>}
            <div className="chip-wrap">
              {a.conversationId ? <Link className="btn btn-sm" href={`/messages/${a.conversationId}`}>Répondre</Link> : null}
              <button type="button" className="btn btn-secondary btn-sm" aria-pressed={a.status === 'shortlisted'} onClick={() => void decide(a, 'shortlisted')}>
                {a.status === 'shortlisted' ? 'Retenue ✓' : 'Retenir'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" aria-pressed={a.status === 'rejected'} onClick={() => void decide(a, 'rejected')}>
                {a.status === 'rejected' ? 'Écartée' : 'Écarter'}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
