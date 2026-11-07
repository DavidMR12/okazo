'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { chatbubblesOutline, chevronForward, imageOutline, searchOutline } from 'ionicons/icons';
import { DECOR_MESSAGES, Decor, DecorFooter } from '@/components/Decor';
import { Ion } from '@/components/Ion';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { relativeTime } from '@/lib/format';
import type { InboxItem } from '@/lib/types';

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

export default function InboxPage() {
  const signedIn = useSignedIn();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'buyer' | 'seller'>('all');

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
      <div className="account">
        <h1 className="pill-title">Messages</h1>
        <div className="empty-card empty-tall">
          <Decor icons={DECOR_MESSAGES} />
          <span className="empty-halo"><span className="empty-icon"><Ion icon={chatbubblesOutline} size={34} /></span></span>
          <p>Connectez-vous pour écrire à un vendeur et retrouver vos conversations.</p>
          <Link className="btn" href="/connexion?retour=/messages">Se connecter</Link>
        </div>
      </div>
    );
  }

  const unread = items?.filter((c) => c.unread).length ?? 0;
  const shown = items?.filter((c) => tab === 'all' || c.role === tab) ?? [];

  return (
    <div className="account">
      <div className="page-head">
        <h1 className="pill-title">Messages</h1>
        {unread ? <span className="count-badge">{unread} non lu{unread > 1 ? 's' : ''}</span> : null}
      </div>

      <div className="seg seg-center" role="tablist" aria-label="Conversations">
        {([['all', 'Toutes'], ['buyer', 'Mes achats'], ['seller', 'Mes ventes']] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="seg-btn" onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {error ? <p className="error" role="alert">{error}</p> : null}
      {items === null && !error ? <p className="muted">Chargement…</p> : null}
      {items && !shown.length ? (
        <div className="empty-card empty-tall">
          <Decor icons={DECOR_MESSAGES} />
          <span className="empty-halo"><span className="empty-icon"><Ion icon={chatbubblesOutline} size={34} /></span></span>
          <p>{items.length ? 'Aucune conversation dans cette rubrique.' : 'Aucune conversation pour l’instant. Cliquez sur « Contacter » depuis une annonce pour écrire au vendeur.'}</p>
          {!items.length ? <Link href="/" className="btn btn-secondary"><Ion icon={searchOutline} size={18} /> Voir les annonces</Link> : null}
        </div>
      ) : null}

      {shown.length ? (
        <ul className="inbox-card">
          {shown.map((c) => {
            const name = c.other?.displayName ?? 'Utilisateur supprimé';
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className={`inbox-item${c.unread ? ' unread' : ''}`} prefetch={false}>
                  <span className="inbox-media">
                    {c.listing.thumbnailUrl ? <img src={c.listing.thumbnailUrl} alt="" className="inbox-photo" /> : <span className="inbox-photo card-thumb-empty" aria-hidden><Ion icon={imageOutline} size={22} /></span>}
                    <span className="inbox-avatar" aria-hidden>{initials(name)}</span>
                  </span>
                  <span className="inbox-body">
                    <span className="inbox-line">
                      <span className="inbox-name">{name}</span>
                      <span className="inbox-time">{relativeTime(c.lastMessageAt)}</span>
                    </span>
                    <span className="inbox-listing inbox-ellipsis">
                      <span className={`role-tag ${c.role}`}>{c.role === 'seller' ? 'Vente' : 'Achat'}</span> {c.listing.title}
                    </span>
                    <span className="inbox-preview inbox-ellipsis">{c.lastFromMe ? 'Vous : ' : ''}{c.lastMessagePreview}</span>
                  </span>
                  {c.unread ? <span className="unread-dot" aria-label="Non lu" /> : <Ion icon={chevronForward} size={18} className="account-chevron" />}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {shown.length > 0 && shown.length < 5 ? <DecorFooter icons={DECOR_MESSAGES} text="Écrivez aux vendeurs depuis leurs annonces : vos conversations s’affichent ici." /> : null}
      {cursor ? <button type="button" className="btn btn-secondary" onClick={() => load(cursor)}>Conversations plus anciennes</button> : null}
    </div>
  );
}
