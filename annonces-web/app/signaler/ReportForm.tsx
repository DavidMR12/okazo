'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';

const REASONS = [
  { value: 'scam', label: "Arnaque ou demande d'argent à l'avance" },
  { value: 'fake_photos', label: 'Photos volées ou trompeuses' },
  { value: 'prohibited_item', label: 'Article interdit' },
  { value: 'duplicate', label: 'Annonce en double' },
  { value: 'wrong_category', label: 'Mauvaise catégorie' },
  { value: 'harassment', label: 'Comportement insultant ou harcèlement' },
  { value: 'other', label: 'Autre problème' },
];

export function ReportForm({ listingId, userId, returnTo }: { listingId?: string; userId?: string; returnTo: string }) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (signedIn === false) {
    return (
      <div className="stack">
        <h1>Signaler</h1>
        <p>Connectez-vous pour envoyer un signalement.</p>
        <Link className="btn" href={`/connexion?retour=${encodeURIComponent(returnTo)}`}>Se connecter</Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="stack">
        <h1>Signalement envoyé</h1>
        <p>{done}</p>
        <button className="btn btn-secondary" onClick={() => router.back()}>Retour</button>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ message: string }>('/reports', {
        method: 'POST',
        body: { listingId, userId, reason, details: details.trim() || undefined },
      });
      setDone(r.message);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <h1>Quel est le problème ?</h1>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="visually-hidden">Motif</legend>
        {REASONS.map((r) => (
          <label key={r.value} className="radio">
            <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} required />
            {r.label}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="details">{reason === 'other' ? 'Décrivez le problème (obligatoire)' : 'Détails (facultatif)'}</label>
        <textarea id="details" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
      <p className="muted">Votre signalement est anonyme pour le vendeur.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || !reason || (reason === 'other' && details.trim().length < 10)}>Envoyer le signalement</button>
    </form>
  );
}
