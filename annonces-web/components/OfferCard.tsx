import { formatXaf } from '@/lib/format';
import type { ChatMessage, OfferStatus } from '@/lib/types';

const STATUS: Record<OfferStatus, { label: string; className: string }> = {
  pending: { label: 'En attente de réponse', className: 'badge-blue' },
  accepted: { label: 'Offre acceptée', className: 'badge-green' },
  declined: { label: 'Offre refusée', className: 'badge-red' },
  withdrawn: { label: 'Offre retirée', className: 'badge-grey' },
  expired: { label: 'Offre expirée (48 h sans réponse)', className: 'badge-grey' },
};

/** Carte d'une offre de prix : le vendeur accepte ou refuse, l'acheteur peut retirer une offre en attente. */
export function OfferCard({ message, mine, isSeller, busy, onAction }: {
  message: ChatMessage;
  mine: boolean;
  isSeller: boolean;
  busy: boolean;
  onAction: (offerId: string, action: 'accept' | 'decline' | 'withdraw') => void;
}) {
  const o = message.offer;
  if (!o) return <p className="chat-system">{message.body}</p>;
  const s = STATUS[o.status];
  return (
    <div className={`offer-card ${mine ? 'mine' : 'theirs'}`}>
      <span className="muted small">{mine ? 'Votre offre' : 'Offre reçue'}</span>
      <strong className="offer-amount">{formatXaf(o.amountXaf)}</strong>
      <span className={`badge ${s.className}`}>{s.label}</span>
      {o.status === 'pending' && isSeller ? (
        <div className="chip-wrap">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onAction(o.id, 'accept')}>Accepter</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction(o.id, 'decline')}>Refuser</button>
        </div>
      ) : null}
      {o.status === 'pending' && mine ? <button type="button" className="link-button small" disabled={busy} onClick={() => onAction(o.id, 'withdraw')}>Retirer mon offre</button> : null}
      {o.status === 'accepted' ? <span className="muted small">Convenez d’un rendez-vous ici. Payez seulement à la rencontre, après avoir vu l’article.</span> : null}
    </div>
  );
}
