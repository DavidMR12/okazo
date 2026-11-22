'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { formatXaf } from '@/lib/format';

interface Payment {
  status: 'pending' | 'completed' | 'failed' | 'expired';
  amountXaf: number;
  days: number;
  listingId: string | null;
  listingTitle: string | null;
  boostUntil: string | null;
  message: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLL_MS = 3000;
const POLL_MAX = 60; // 3 minutes ; au-delà, le rattrapage automatique prend le relais

/** Retour de la page de paiement : pawaPay ajoute ?depositId=…. Le statut est relu chez nous, jamais pris dans l'adresse. */
function PaymentReturn() {
  const id = useSearchParams().get('depositId') ?? '';
  const signedIn = useSignedIn();
  const [p, setP] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!signedIn || !UUID.test(id)) return;
    if (p && p.status !== 'pending') return;
    if (tries > POLL_MAX) return;
    const t = setTimeout(
      () => {
        call<Payment>(`/payments/${id}`)
          .then(setP)
          .catch((e) => setError(e instanceof ClientError ? e.message : 'Impossible de lire le paiement.'))
          .finally(() => setTries((n) => n + 1));
      },
      tries === 0 ? 0 : POLL_MS,
    );
    return () => clearTimeout(t);
  }, [signedIn, id, p, tries]);

  if (signedIn === false) {
    return <Link href={`/connexion?retour=${encodeURIComponent(`/paiement/retour?depositId=${id}`)}`} className="btn">Se connecter</Link>;
  }
  if (!UUID.test(id)) return <p className="error" role="alert">Paiement introuvable.</p>;
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!p || p.status === 'pending') {
    return tries > POLL_MAX ? (
      <p className="muted">Paiement toujours en cours de confirmation par l’opérateur. Vous pouvez quitter cette page : l’annonce passera à la une dès réception.</p>
    ) : (
      <p className="muted" role="status">Confirmation du paiement… Validez la demande sur votre téléphone si ce n’est pas encore fait.</p>
    );
  }
  if (p.status === 'completed') {
    const until = p.boostUntil ? new Date(p.boostUntil).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null;
    return (
      <p className="success" role="status">
        Paiement de {formatXaf(p.amountXaf)} reçu. {p.listingTitle ? `« ${p.listingTitle} »` : 'Votre annonce'} est à la une{until ? ` jusqu’au ${until}` : ''}.
      </p>
    );
  }
  return (
    <p className="error" role="alert">
      {p.status === 'expired' ? 'Paiement abandonné : aucun montant n’a été prélevé.' : p.message}
    </p>
  );
}

export default function PaymentReturnPage() {
  return (
    <div className="narrow stack">
      <h1>Paiement</h1>
      <Suspense fallback={<p className="muted">Chargement…</p>}>
        <PaymentReturn />
      </Suspense>
      <Link href="/mes-annonces" className="btn btn-secondary">Mes annonces</Link>
    </div>
  );
}
