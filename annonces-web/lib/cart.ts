'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { call, useSignedIn } from './client';

/**
 * Identifiants des articles du panier, partagés par l'en-tête (pastille) et les boutons « Ajouter au panier » :
 * une seule requête par page. Le panier est une liste d'achats : aucun paiement ne passe par le site.
 */
let ids: ReadonlySet<string> = new Set();
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const setIds = (next: ReadonlySet<string>) => {
  ids = next;
  listeners.forEach((l) => l());
};

function load() {
  if (loaded || loading) return;
  loading = call<{ ids: string[] }>('/me/cart/ids')
    .then((r) => {
      loaded = true;
      setIds(new Set(r.ids));
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
}

/** Ajout ou retrait immédiat à l'écran, annulé si l'appel échoue (l'erreur est renvoyée à l'appelant). */
export async function setInCart(id: string, on: boolean): Promise<void> {
  const before = ids;
  const next = new Set(ids);
  if (on) next.add(id);
  else next.delete(id);
  setIds(next);
  try {
    await call(`/cart/${id}`, { method: on ? 'PUT' : 'DELETE' });
  } catch (e) {
    setIds(before);
    throw e;
  }
}

export function useCartIds(): ReadonlySet<string> {
  const signedIn = useSignedIn();
  useEffect(() => {
    if (signedIn) load();
  }, [signedIn]);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => ids,
    () => ids,
  );
}
