'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { formatXaf } from '@/lib/format';

interface Offers {
  enabled: boolean;
  offers: { days: number; priceXaf: number }[];
}

/**
 * Mise à la une d'une annonce, payée par Mobile Money (pawaPay, 22/11/2026). Le vendeur choisit une durée,
 * puis paie sur la page de pawaPay (choix de l'opérateur, confirmation sur le téléphone) et revient sur /paiement/retour.
 * Vendu sur le site seulement : dans les applis, Google et Apple imposent leur propre système de paiement.
 */
export default function BoostPage() {
  const { id } = useParams<{ id: string }>();
  const signedIn = useSignedIn();
  const [listing, setListing] = useState<{ title: string; status: string } | null>(null);
  const [data, setData] = useState<Offers | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    Promise.all([call<{ title: string; status: string }>(`/me/listings/${id}`), call<Offers>('/boosts/offers')])
      .then(([l, o]) => {
        setListing(l);
        setData(o);
        setDays(o.offers[1]?.days ?? o.offers[0]?.days ?? null);
      })
      .catch((e) => setError(e instanceof ClientError ? e.message : 'Chargement impossible.'));
  }, [signedIn, id]);

  const pay = async () => {
    if (!days || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ redirectUrl: string }>(`/listings/${id}/boost`, { method: 'POST', body: { days } });
      // Seulement une adresse https (page du prestataire) ou notre propre site (paiement simulé en développement)
      const url = new URL(r.redirectUrl, window.location.href);
      if (url.protocol !== 'https:' && url.origin !== window.location.origin) throw new Error();
      window.location.assign(url.toString());
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Paiement indisponible pour le moment. Réessayez dans quelques minutes.');
      setBusy(false);
    }
  };

  if (signedIn === false) {
    return (
      <div className="narrow stack">
        <h1>Mettre à la une</h1>
        <Link href={`/connexion?retour=/mes-annonces/${id}/a-la-une`} className="btn">Se connecter</Link>
      </div>
    );
  }

  const chosen = data?.offers.find((o) => o.days === days);
  return (
    <div className="narrow stack">
      <h1>Mettre à la une</h1>
      {listing ? <p className="muted">{listing.title}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {!data && !error ? <p className="muted">Chargement…</p> : null}
      {data && !data.enabled ? <p className="muted">Le paiement en ligne arrive bientôt.</p> : null}
      {data?.enabled && listing && listing.status !== 'active' ? <p className="muted">Seule une annonce en ligne peut être mise à la une.</p> : null}
      {data?.enabled && listing?.status === 'active' ? (
        <>
          <p>Votre annonce s’affiche en tête de la page d’accueil et des résultats, avec le badge « À la une ».</p>
          <fieldset className="boost-offers" style={data.offers.length <= 3 ? { gridTemplateColumns: `repeat(${data.offers.length}, minmax(0, 1fr))` } : undefined}>
            <legend className="sr-only">Durée</legend>
            {data.offers.map((o) => (
              <label key={o.days} className="boost-offer">
                <input type="radio" name="days" value={o.days} checked={days === o.days} onChange={() => setDays(o.days)} />
                <span className="boost-offer-days">{o.days} jours</span>
                <span className="boost-offer-price">{formatXaf(o.priceXaf)}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" className="btn" disabled={!chosen || busy} onClick={() => void pay()}>
            {busy ? 'Ouverture du paiement…' : chosen ? `Payer ${formatXaf(chosen.priceXaf)}` : 'Payer'}
          </button>
          <p className="muted small">Paiement par Mobile Money (MTN, Orange, Airtel, Moov). Vous confirmez sur votre téléphone ; aucun numéro n’est gardé par Okazo.</p>
        </>
      ) : null}
      <Link href="/mes-annonces" className="link-button">Retour à mes annonces</Link>
    </div>
  );
}
