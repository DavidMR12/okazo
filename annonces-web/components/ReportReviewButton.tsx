'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';

/** « Signaler » sous un avis : faux avis ou propos insultants, examiné par la modération. */
export function ReportReviewButton({ reviewId, returnTo }: { reviewId: string; returnTo: string }) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'menu' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const send = async (reason: 'fake_review' | 'harassment') => {
    try {
      await call(`/reviews/${reviewId}/report`, { method: 'POST', body: { reason } });
      setState('done');
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Envoi impossible.');
    }
  };

  if (state === 'done') return <span className="muted small">Merci, l’avis sera examiné.</span>;
  if (state === 'menu') {
    return (
      <span className="chip-wrap">
        <button type="button" className="link-button small" onClick={() => void send('fake_review')}>Faux avis</button>
        <button type="button" className="link-button small" onClick={() => void send('harassment')}>Insultant</button>
        <button type="button" className="link-button small muted" onClick={() => setState('idle')}>Annuler</button>
        {error ? <span className="error small">{error}</span> : null}
      </span>
    );
  }
  return (
    <button type="button" className="link-button small muted"
      onClick={() => (signedIn ? setState('menu') : router.push(`/connexion?retour=${encodeURIComponent(returnTo)}`))}>
      Signaler
    </button>
  );
}
