'use client';

import { FormEvent, useState } from 'react';
import { call, ClientError } from '@/lib/client';
import { formatXaf } from '@/lib/format';

const MIN_RATIO = 0.3; // même règle que l'API : au moins 30 % du prix affiché
const groupDigits = (d: string) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * « Faire une offre » : montant (avec propositions à -5 %, -10 %, -15 %) et message facultatif.
 * Ouvre ou complète la conversation avec le vendeur ; onSent reçoit son identifiant.
 */
export function OfferForm({ listingId, price, onSent, onCancel }: { listingId: string; price: number | null; onSent: (conversationId: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const suggestions = price ? [5, 10, 15].map((p) => ({ label: `-${p} %`, value: Math.round((price * (100 - p)) / 100 / 500) * 500 })) : [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n) return setError('Indiquez un montant.');
    if (price && n >= price) return setError(`Proposez un montant inférieur au prix affiché (${formatXaf(price)}).`);
    if (price && n < Math.ceil(price * MIN_RATIO)) return setError(`Offre trop basse : proposez au moins ${formatXaf(Math.ceil(price * MIN_RATIO))}.`);
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ conversationId: string }>(`/listings/${listingId}/offers`, { method: 'POST', body: { amountXaf: n, message: message.trim() || undefined } });
      onSent(r.conversationId);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Envoi impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="offer-form stack" onSubmit={submit} noValidate>
      <strong>Faire une offre</strong>
      <p className="muted small" style={{ margin: 0 }}>{price ? `Prix affiché : ${formatXaf(price)}. ` : 'Prix sur demande. '}Le vendeur a 48 h pour répondre.</p>
      {suggestions.length ? (
        <div className="chip-wrap">
          {suggestions.map((s) => (
            <button key={s.label} type="button" className="chip" aria-pressed={Number(amount) === s.value} onClick={() => setAmount(String(s.value))}>
              {formatXaf(s.value)} ({s.label})
            </button>
          ))}
        </div>
      ) : null}
      <div className="price-input">
        <label htmlFor="offer-amount" className="visually-hidden">Montant de l’offre en francs CFA</label>
        <input id="offer-amount" inputMode="numeric" value={groupDigits(amount)} placeholder="Votre prix" onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11))} />
        <span>FCFA</span>
      </div>
      <input value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} placeholder="Un mot pour le vendeur (facultatif)" aria-label="Message pour le vendeur" />
      {error ? <p className="error" role="alert" style={{ margin: 0 }}>{error}</p> : null}
      <div className="chip-wrap">
        <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer mon offre'}</button>
        <button type="button" className="link-button" onClick={onCancel}>Annuler</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Aucun paiement sur le site : vous réglez à la rencontre, après avoir vu l’article.</p>
    </form>
  );
}
