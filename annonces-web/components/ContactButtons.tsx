'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { OfferForm } from './OfferForm';
import { takeResumeAction, withAction } from '@/lib/resume';

/** Le numéro n'est jamais dans la page : il est demandé au clic, par un visiteur connecté (limite quotidienne). */
export function ContactButtons({ listingId, title, returnTo, messagesOnly, jobOffer = false, sellerId, offerPrice }: { listingId: string; title: string; returnTo: string; messagesOnly: boolean; jobOffer?: boolean; sellerId?: string; offerPrice?: number | null }) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Offre d'emploi : « Postuler » remplace « Écrire au vendeur » (la candidature ouvre aussi la conversation)
  const [applied, setApplied] = useState(false);
  // offerPrice : undefined = pas d'offre possible ; null = prix sur demande (offre libre)
  const [offerOpen, setOfferOpen] = useState(false);
  const [own, setOwn] = useState(false); // le recruteur voit « Voir les candidatures » sur sa propre offre
  // Sa propre annonce : ni « Postuler » ni « Faire une offre »
  const canOffer = offerPrice !== undefined && !jobOffer;
  useEffect(() => {
    if (!signedIn || (!jobOffer && !canOffer)) return;
    Promise.all([
      call<{ id: string }>('/auth/me'),
      jobOffer ? call<{ items: unknown[] }>(`/me/applications?listingId=${listingId}`) : Promise.resolve({ items: [] as unknown[] }),
    ])
      .then(([me, r]) => {
        setOwn(me.id === sellerId);
        setApplied(r.items.length > 0);
      })
      .catch(() => undefined);
  }, [signedIn, jobOffer, canOffer, listingId, sellerId]);

  const login = (action: 'whatsapp' | 'numero') => router.push(`/connexion?retour=${encodeURIComponent(withAction(returnTo, action))}`);

  const fetchContact = async (action: 'whatsapp' | 'numero') => {
    if (!signedIn) {
      login(action);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const c = await call<{ phone: string; whatsappUrl: string }>(`/listings/${listingId}/contact`);
      setPhone(c.phone);
      return c;
    } catch (e) {
      if (e instanceof ClientError && e.status === 401) login(action);
      else setError(e instanceof ClientError ? e.message : 'Action impossible.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const whatsapp = async () => {
    const c = await fetchContact('whatsapp');
    if (c) window.location.href = c.whatsappUrl;
  };

  // Retour de la connexion : on termine l'action commencée (ouvrir WhatsApp ou afficher le numéro)
  useEffect(() => {
    if (!signedIn || messagesOnly) return;
    const a = takeResumeAction(['whatsapp', 'numero']);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement ou réinitialisation voulus à l’affichage
    if (a === 'whatsapp') void whatsapp();
    else if (a === 'numero') void fetchContact('numero');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const writeHref = `/messages/nouveau?annonce=${listingId}&titre=${encodeURIComponent(title)}`;
  const write = () => router.push(signedIn ? writeHref : `/connexion?retour=${encodeURIComponent(writeHref)}`);
  const applyHref = `/postuler/${listingId}?titre=${encodeURIComponent(title)}`;

  return (
    <div className="stack">
      {jobOffer && own ? (
        <Link className="btn" href={`/mes-annonces/${listingId}/candidatures`}>Voir les candidatures</Link>
      ) : jobOffer && applied ? (
        <Link className="btn btn-secondary" href="/candidatures">✓ Candidature envoyée</Link>
      ) : jobOffer ? (
        <a className="btn" href={signedIn ? applyHref : `/connexion?retour=${encodeURIComponent(applyHref)}`}>Postuler</a>
      ) : (
        <button type="button" className="btn" onClick={write}>
          Écrire au vendeur
        </button>
      )}
      {canOffer && !own ? (
        offerOpen ? (
          <OfferForm listingId={listingId} price={offerPrice} onCancel={() => setOfferOpen(false)} onSent={(conv) => router.push(`/messages/${conv}`)} />
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => (signedIn ? setOfferOpen(true) : router.push(`/connexion?retour=${encodeURIComponent(returnTo)}`))}>
            Faire une offre
          </button>
        )
      ) : null}
      {messagesOnly ? <p className="muted" style={{ margin: 0 }}>Ce vendeur préfère être contacté par la messagerie.</p> : null}
      {!messagesOnly ? (
      <>
      <button type="button" className="btn btn-whatsapp" onClick={() => void whatsapp()} disabled={loading}>
        Contacter sur WhatsApp
      </button>
      {phone ? (
        <a className="btn btn-secondary" href={`tel:${phone}`}>Appeler le {phone}</a>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => void fetchContact('numero')} disabled={loading}>
          Afficher le numéro
        </button>
      )}
      </>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {signedIn === false ? <p className="muted">Connexion requise pour contacter le vendeur : cela protège les vendeurs contre le démarchage.</p> : null}
    </div>
  );
}
