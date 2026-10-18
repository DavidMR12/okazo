'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { relativeTime } from '@/lib/format';
import type { InboxItem } from '@/lib/types';

export default function InboxPage() {
  const signedIn = useSignedIn();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((after?: string) => {
    call<{ items: InboxItem[]; nextCursor: string | null }>(`/conversations${after ? `?cursor=${encodeURIComponent(after)}` : ''}`)
      .then((r) => {
        setItems((prev) => (after ? [...(prev ?? []), ...r.items] : r.items));
        setCursor(r.nextCursor);
        setError(null);
      })
      .catch((e) => setError(e instanceof ClientError ? e.message : 'Chargement impossible.'));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 20_000);
    return () => clearInterval(t);
  }, [signedIn, load]);

  if (signedIn === false) {
    return (
      <div className="narrow stack">
        <h1>Messages</h1>
        <p>Connectez-vous pour écrire à un vendeur et retrouver vos conversations.</p>
        <Link className="btn" href="/connexion?retour=/messages">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="container section stack" style={{ maxWidth: 760 }}>
      <h1>Messages</h1>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {items === null && !error ? <p className="muted">Chargement…</p> : null}
      {items?.length === 0 ? <p className="muted">Aucune conversation. Cliquez sur « Écrire au vendeur » depuis une annonce pour commencer.</p> : null}
      <ul className="inbox">
        {items?.map((c) => (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} className={`inbox-row${c.unread ? ' unread' : ''}`} prefetch={false}>
              {c.listing.thumbnailUrl ? <img src={c.listing.thumbnailUrl} alt="" className="inbox-thumb" /> : <span className="inbox-thumb" />}
              <span className="inbox-body">
                <span className="inbox-line">
                  <span className="inbox-name">{c.other?.displayName ?? 'Utilisateur supprimé'}</span>
                  <span className="muted">{relativeTime(c.lastMessageAt)}</span>
                </span>
                <span className="muted inbox-ellipsis">{c.role === 'seller' ? 'Votre annonce : ' : ''}{c.listing.title}</span>
                <span className="inbox-preview inbox-ellipsis">{c.lastFromMe ? 'Vous : ' : ''}{c.lastMessagePreview}</span>
              </span>
              {c.unread ? <span className="unread-dot" aria-label="Non lu" /> : null}
            </Link>
          </li>
        ))}
      </ul>
      {cursor ? <button type="button" className="btn btn-secondary" onClick={() => load(cursor)}>Conversations plus anciennes</button> : null}
    </div>
  );
}
