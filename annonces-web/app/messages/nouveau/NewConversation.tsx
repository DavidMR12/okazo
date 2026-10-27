'use client';

/* eslint-disable @next/next/no-img-element -- miniature déjà optimisée (WebP) et servie par le CDN */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { chatbubbleEllipsesOutline, imageOutline, locationOutline, sendOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { DetailCard } from '@/components/DetailCard';
import { Ion } from '@/components/Ion';
import { PriceTag } from '@/components/PriceTag';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { listingPath } from '@/lib/format';
import type { ListingDetail } from '@/lib/types';

const MAX = 2000;

/** Premier message. Si une conversation existe déjà pour cette annonce, on l'ouvre directement. */
export function NewConversation({ listingId, title, message }: { listingId: string; title: string; message?: string }) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [body, setBody] = useState(message ?? `Bonjour, votre annonce « ${title} » est-elle toujours disponible ?`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = `/messages/nouveau?annonce=${listingId}&titre=${encodeURIComponent(title)}`;
  const valid = /^[0-9a-f-]{36}$/i.test(listingId);

  useEffect(() => {
    if (signedIn === false) router.replace(`/connexion?retour=${encodeURIComponent(back)}`);
    if (!signedIn || !valid) return;
    call<{ id: string }>(`/conversations/with-listing/${listingId}`)
      .then((c) => router.replace(`/messages/${c.id}`))
      .catch(() => setChecking(false));
    // Aperçu de l'annonce (photo, prix, lieu, vendeur) au-dessus du message
    call<ListingDetail>(`/listings/${listingId}`).then(setListing).catch(() => undefined);
  }, [signedIn, listingId, router, back, valid]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ conversationId: string }>('/conversations', { method: 'POST', body: { listingId, body: body.trim() } });
      router.replace(`/messages/${r.conversationId}`);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (!valid) return <div className="account"><p>Annonce introuvable. <Link href="/">Retour</Link></p></div>;
  if (checking) return <div className="account"><p className="muted">Chargement…</p></div>;

  const name = listing?.title ?? title;
  // Messages tout prêts : un clic remplace le texte
  const quick = [
    `Bonjour, votre annonce « ${name} » est-elle toujours disponible ?`,
    'Bonjour, le prix est-il négociable ?',
    'Bonjour, où et quand peut-on se rencontrer pour voir l’article ?',
    ...(listing?.handDelivery ? ['Bonjour, une remise en main propre est-elle possible cette semaine ?'] : []),
  ];
  const thumb = listing?.images[0]?.thumbUrl;
  const place = listing ? [listing.district, listing.city].filter(Boolean).join(', ') : '';

  return (
    <form className="account" onSubmit={submit}>
      <h1>Écrire au vendeur</h1>

      {/* L'annonce concernée, comme une carte */}
      <Link href={listing ? listingPath(listing) : '#'} className="compose-listing">
        {thumb ? <img src={thumb} alt="" className="compose-thumb" /> : <span className="compose-thumb card-thumb-empty" aria-hidden><Ion icon={imageOutline} size={26} /></span>}
        <span className="compose-info">
          <strong className="compose-title">{name}</strong>
          {listing ? <PriceTag priceType={listing.priceType} priceXaf={listing.priceXaf} unit={listing.priceUnit} /> : null}
          {place ? <span className="compose-meta"><Ion icon={locationOutline} size={15} /> {place}</span> : null}
          {listing ? <span className="compose-meta">Vendu par <strong>{listing.seller.displayName}</strong>{listing.seller.verificationLevel === 'identity' ? ' · identité vérifiée' : ''}</span> : null}
        </span>
      </Link>

      <DetailCard id="h-message" icon={chatbubbleEllipsesOutline} title="Votre message">
        <div className="compose-quick" role="group" aria-label="Messages tout prêts">
          {quick.map((q) => (
            <button key={q} type="button" className="compose-chip" aria-pressed={body === q} onClick={() => setBody(q)}>{q.replace(/^Bonjour, /, '').replace(/^./, (c) => c.toUpperCase())}</button>
          ))}
        </div>
        <label htmlFor="first" className="visually-hidden">Votre message</label>
        <div className="compose-box">
          <textarea id="first" value={body} maxLength={MAX} onChange={(e) => setBody(e.target.value)} autoFocus rows={5} />
          <span className="compose-count" aria-live="polite">{body.length}/{MAX}</span>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="btn compose-send" type="submit" disabled={busy || !body.trim()}>
          <Ion icon={sendOutline} size={19} /> {busy ? 'Envoi…' : 'Envoyer le message'}
        </button>
      </DetailCard>

      <aside className="compose-safety">
        <span className="fact-icon"><Ion icon={shieldCheckmarkOutline} size={20} /></span>
        <span>
          <strong>Restez sur la messagerie jusqu’à la rencontre</strong>
          <span>Vos échanges y sont protégés et vous pouvez signaler un comportement suspect. Ne payez jamais à l’avance : vérifiez l’article, puis payez à la remise.</span>
        </span>
      </aside>
    </form>
  );
}
