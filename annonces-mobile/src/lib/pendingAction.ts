/**
 * Reprise automatique après connexion : l’action qui a déclenché la connexion (écrire, postuler, WhatsApp,
 * appeler, favori, panier, signaler) est mémorisée, puis exécutée dès le retour sur l’écran d’origine.
 * Valable 10 minutes, une seule fois.
 */
export type PendingKind = 'write' | 'apply' | 'offer' | 'whatsapp' | 'call' | 'favorite' | 'cart' | 'report';
type Origin = 'listing' | 'feed';

let pending: { kind: PendingKind; listingId: string; origin: Origin; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

export function setPendingAction(kind: PendingKind, listingId: string, origin: Origin) {
  pending = { kind, listingId, origin, at: Date.now() };
}

export function takePendingAction(origin: Origin, listingId?: string): { kind: PendingKind; listingId: string } | null {
  if (!pending) return null;
  if (Date.now() - pending.at > TTL_MS) {
    pending = null;
    return null;
  }
  if (pending.origin !== origin || (listingId && pending.listingId !== listingId)) return null;
  const p = pending;
  pending = null;
  return { kind: p.kind, listingId: p.listingId };
}
