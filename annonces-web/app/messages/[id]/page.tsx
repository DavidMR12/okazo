'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PriceTag } from '@/components/PriceTag';
import { OfferCard } from '@/components/OfferCard';
import { OfferForm } from '@/components/OfferForm';
import { ReviewBox } from '@/components/ReviewBox';
import { call, ClientError } from '@/lib/client';
import { listingPath } from '@/lib/format';
import { MESSAGE_WARNINGS } from '@/lib/messageWarnings';
import type { ChatMessage, ConversationMeta, ConversationPayload } from '@/lib/types';

const POLL_MS = 4000;
let tempId = -1;

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const [myId, setMyId] = useState<string | null>(null);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [otherRead, setOtherRead] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const lastId = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    // Une réponse à une offre met aussi à jour la carte de l'offre déjà affichée
    const statuses = new Map(incoming.filter((m) => m.offer).map((m) => [m.offer!.id, m.offer!.status]));
    setMsgs((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const updated = prev.map((m) => (m.offer && statuses.has(m.offer.id) ? { ...m, offer: { ...m.offer, status: statuses.get(m.offer.id)! } } : m));
      return [...updated, ...incoming.filter((m) => !known.has(m.id))];
    });
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
  }, []);

  useEffect(() => {
    call<{ id: string }>('/auth/me').then((m) => setMyId(m.id)).catch(() => undefined);
    call<ConversationPayload>(`/conversations/${id}`)
      .then((r) => {
        setMeta(r.conversation);
        setOtherRead(r.otherLastReadAt);
        setHasOlder(r.hasOlder);
        merge(r.messages);
      })
      .catch((e) => setError(e instanceof ClientError ? e.message : 'Conversation indisponible.'));
  }, [id, merge]);

  // Relevé régulier, seulement quand l'onglet du navigateur est visible
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible' || !lastId.current) return;
      call<ConversationPayload>(`/conversations/${id}?after=${lastId.current}`)
        .then((r) => {
          merge(r.messages);
          setOtherRead(r.otherLastReadAt);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [id, merge]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length]);

  const refresh = useCallback(() => {
    call<ConversationPayload>(`/conversations/${id}?after=${lastId.current || 1}`).then((r) => merge(r.messages)).catch(() => undefined);
  }, [id, merge]);

  const actOnOffer = async (offerId: string, action: 'accept' | 'decline' | 'withdraw') => {
    if (action === 'accept' && !window.confirm('Accepter cette offre ? L’acheteur sera prévenu. Marquez l’annonce vendue après la vente.')) return;
    setActing(offerId);
    try {
      await call(`/offers/${offerId}/${action}`, { method: 'POST' });
    } catch (e) {
      setNotice(e instanceof ClientError ? e.message : 'Action impossible. Réessayez.');
    } finally {
      setActing(null);
      refresh();
    }
  };

  const loadOlder = async () => {
    const first = msgs.find((m) => m.id > 0);
    if (!first) return;
    const r = await call<ConversationPayload>(`/conversations/${id}?before=${first.id}`).catch(() => null);
    if (!r) return;
    setHasOlder(r.hasOlder);
    setMsgs((prev) => [...r.messages, ...prev]);
  };

  const send = async (body: string, retryOf?: number) => {
    if (!myId || !body.trim()) return;
    const temp: ChatMessage = { id: retryOf ?? tempId--, senderId: myId, body: body.trim(), flags: [], createdAt: new Date().toISOString() };
    setMsgs((prev) => (retryOf ? prev.map((m) => (m.id === retryOf ? temp : m)) : [...prev, temp]));
    if (!retryOf) setText('');
    try {
      const saved = await call<ChatMessage>(`/conversations/${id}/messages`, { method: 'POST', body: { body: temp.body } });
      setMsgs((prev) => prev.map((m) => (m.id === temp.id ? saved : m)));
      lastId.current = Math.max(lastId.current, saved.id);
    } catch (e) {
      setMsgs((prev) => prev.map((m) => (m.id === temp.id ? { ...m, failed: true } : m)));
      if (e instanceof ClientError && e.status !== 0) setNotice(e.message);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };
  // Entrée envoie, Maj+Entrée va à la ligne
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(text);
    }
  };

  const report = async (reason: 'scam' | 'harassment') => {
    if (!window.confirm(reason === 'scam' ? 'Signaler une tentative d’arnaque ?' : 'Signaler un comportement insultant ?')) return;
    try {
      const r = await call<{ message: string }>(`/conversations/${id}/report`, { method: 'POST', body: { reason } });
      setNotice(r.message);
    } catch (e) {
      setNotice(e instanceof ClientError ? e.message : 'Envoi impossible.');
    }
  };

  const toggleBlock = async () => {
    if (!meta?.other) return;
    if (!meta.iBlocked && !window.confirm(`Bloquer ${meta.other.displayName} ? Vous ne pourrez plus vous écrire.`)) return;
    try {
      await call(`/users/${meta.other.id}/block`, { method: meta.iBlocked ? 'DELETE' : 'POST' });
      setMeta({ ...meta, iBlocked: !meta.iBlocked });
    } catch {
      setNotice('Action impossible. Réessayez.');
    }
  };

  const lastMineSeen = useMemo(() => {
    if (!otherRead) return null;
    const mine = msgs.filter((m) => m.senderId === myId && m.id > 0 && m.createdAt <= otherRead);
    return mine.length ? mine[mine.length - 1].id : null;
  }, [msgs, myId, otherRead]);

  if (error) return <div className="narrow stack"><p className="error">{error}</p><Link href="/messages">Retour aux messages</Link></div>;
  if (!meta) return <div className="narrow"><p className="muted">Chargement…</p></div>;

  const otherInactive = !meta.other || meta.other.status === 'banned' || meta.other.status === 'deleted';
  const canWrite = !otherInactive && !meta.iBlocked;
  // « Faire une offre » : l'acheteur, sur une annonce « Je propose » en ligne avec un prix (hors Emploi), sans offre en attente
  const l = meta.listing;
  const offerPrice = l && (l.priceType === 'fixed' || l.priceType === 'negotiable') ? l.priceXaf : null;
  const hasPendingOffer = msgs.some((m) => m.senderId === myId && m.offer?.status === 'pending');
  const canOffer = canWrite && meta.role === 'buyer' && !!l && l.status === 'active' && l.adType !== 'request' && l.parentSlug !== 'emploi' && l.priceType !== 'free' && !hasPendingOffer;

  return (
    <div className="chat container">
      <header className="chat-head">
        <Link href="/messages" className="muted">← Messages</Link>
        <h1 className="chat-title">{meta.other?.displayName ?? 'Utilisateur supprimé'}</h1>
        <details className="chat-menu">
          <summary aria-label="Signaler ou bloquer">⋯</summary>
          <div className="chat-menu-list">
            <button type="button" onClick={() => void report('scam')}>Signaler une arnaque</button>
            <button type="button" onClick={() => void report('harassment')}>Signaler un comportement insultant</button>
            <button type="button" onClick={() => void toggleBlock()}>{meta.iBlocked ? 'Débloquer' : 'Bloquer cette personne'}</button>
          </div>
        </details>
      </header>

      {meta.listing ? (
        <Link href={listingPath(meta.listing)} className="chat-listing">
          {meta.listing.thumbnailUrl ? <img src={meta.listing.thumbnailUrl} alt="" /> : <span className="inbox-thumb" />}
          <span className="stack" style={{ gap: 4 }}>
            <span>{meta.listing.title}</span>
            <PriceTag priceType={meta.listing.priceType} priceXaf={meta.listing.priceXaf} />
          </span>
        </Link>
      ) : null}

      <ReviewBox conversationId={meta.id} />

      {notice ? <p className="chat-notice" role="status">{notice} <button type="button" className="link-button" onClick={() => setNotice(null)}>Fermer</button></p> : null}

      <div className="chat-scroll" aria-live="polite">
        {hasOlder ? <button type="button" className="link-button chat-older" onClick={() => void loadOlder()}>Messages plus anciens</button> : null}
        <p className="chat-safety">{meta?.listing?.parentSlug === 'emploi' ? 'Restez sur la messagerie. Un vrai recruteur ne demande jamais d’argent (frais de dossier, formation, tenue…) : dans ce cas, signalez la conversation.' : 'Restez sur la messagerie jusqu’à la rencontre. Ne payez jamais à l’avance et vérifiez l’article avant de payer.'}</p>
        {msgs.map((m) => {
          const mine = m.senderId === myId;
          if (m.kind === 'offer') return <OfferCard key={m.id} message={m} mine={mine} isSeller={meta.role === 'seller'} busy={acting === m.offer?.id} onAction={(oid, a) => void actOnOffer(oid, a)} />;
          if (m.kind && m.kind !== 'text') return <p key={m.id} className="chat-system">{m.body}</p>;
          return (
            <div key={m.id} className={`bubble-row ${mine ? 'mine' : 'theirs'}`}>
              {m.failed ? (
                <button type="button" className="bubble bubble-failed" onClick={() => void send(m.body, m.id)}>{m.body}</button>
              ) : (
                <p className="bubble">{m.body}</p>
              )}
              {!mine && m.flags.map((f) => <p key={f} className="msg-warning">⚠ {MESSAGE_WARNINGS[f]}</p>)}
              {m.failed ? <span className="bubble-meta">Non envoyé. Cliquez pour réessayer.</span> : null}
              {m.id < 0 && !m.failed ? <span className="bubble-meta">Envoi…</span> : null}
              {m.id === lastMineSeen ? <span className="bubble-meta">Vu</span> : null}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {canOffer && meta.listing ? (
        offerOpen ? (
          <OfferForm listingId={meta.listing.id} price={offerPrice} onCancel={() => setOfferOpen(false)} onSent={() => { setOfferOpen(false); refresh(); }} />
        ) : (
          <div className="offer-bar"><button type="button" className="chip" onClick={() => setOfferOpen(true)}>Faire une offre</button></div>
        )
      ) : null}
      {canWrite ? (
        <form className="chat-composer" onSubmit={submit}>
          <label htmlFor="msg" className="visually-hidden">Votre message</label>
          <textarea id="msg" value={text} maxLength={2000} rows={1} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="Votre message" />
          <button type="submit" className="btn" disabled={!text.trim()}>Envoyer</button>
        </form>
      ) : (
        <p className="chat-closed muted">{meta.iBlocked ? 'Vous avez bloqué cette personne.' : "Ce compte n'est plus actif."}</p>
      )}
    </div>
  );
}
