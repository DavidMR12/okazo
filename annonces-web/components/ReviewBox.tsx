'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { call, ClientError } from '@/lib/client';
import { RATING_LABELS, Stars } from './Stars';

interface Status {
  canReview: boolean;
  parentSlug?: string | null;
  role: 'buyer' | 'seller';
  target: { id: string; displayName: string } | null;
  mine: { rating: number; comment: string | null } | null;
}

/**
 * Dans une conversation : donner son avis quand l'échange le permet (les deux ont écrit, depuis 24 h
 * ou annonce vendue), ou rappel de l'avis donné. Rien sinon.
 */
export function ReviewBox({ conversationId }: { conversationId: string }) {
  const [s, setS] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    call<Status>(`/conversations/${conversationId}/review`).then(setS).catch(() => undefined);
  }, [conversationId]);
  useEffect(load, [load]);

  if (!s) return null;
  if (s.mine) {
    return (
      <div className="review-box">
        <span className="muted">Votre avis sur {s.target?.displayName}</span> <Stars value={s.mine.rating} />
      </div>
    );
  }
  if (!s.canReview || !s.target) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = comment.trim();
    if (!rating) return setError('Choisissez une note de 1 à 5 étoiles.');
    if (text && text.length < 10) return setError('Écrivez au moins 10 caractères, ou laissez le commentaire vide.');
    setBusy(true);
    setError(null);
    try {
      await call(`/conversations/${conversationId}/review`, { method: 'POST', body: { rating, comment: text || undefined } });
      load();
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Envoi impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="review-box review-invite">
        <span>Comment s’est passé l’échange avec {s.target.displayName} ?</span>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>Donner mon avis</button>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <form className="review-box review-form stack" onSubmit={submit} noValidate>
      <strong>Votre avis sur {s.target.displayName}</strong>
      <div className="star-input" role="radiogroup" aria-label="Note" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} étoile${i > 1 ? 's' : ''}, ${RATING_LABELS[i]}`}
            className={shown >= i ? 'on' : undefined} onMouseEnter={() => setHover(i)} onClick={() => setRating(i)}>★</button>
        ))}
        <span className="muted">{shown ? RATING_LABELS[shown] : 'Choisissez une note'}</span>
      </div>
      <textarea value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} placeholder={s.parentSlug === 'emploi' ? 'Facultatif. Ex. : ponctuel, sérieux, entretien bien organisé.' : 'Facultatif. Ex. : à l’heure, article conforme à l’annonce.'} aria-label="Commentaire" />
      <p className="muted" style={{ margin: 0 }}>Votre avis est public, signé de votre nom. Pas de numéro de téléphone ni de lien.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="chip-wrap">
        <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? 'Envoi…' : 'Publier mon avis'}</button>
        <button type="button" className="link-button" onClick={() => setOpen(false)}>Annuler</button>
      </div>
    </form>
  );
}
