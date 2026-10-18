'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { call, useSignedIn } from './client';

/**
 * Favoris de l'utilisateur, partagés par tous les cœurs d'une page : une seule requête
 * (`/me/favorites/ids`) quel que soit le nombre d'annonces affichées.
 */
let ids: ReadonlySet<string> = new Set();
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const setIds = (next: ReadonlySet<string>) => {
  ids = next;
  emit();
};

function load() {
  if (loaded || loading) return;
  loading = call<{ ids: string[] }>('/me/favorites/ids')
    .then((r) => {
      loaded = true;
      setIds(new Set([...r.ids, ...ids]));
      resumeFromLogin();
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
}

/** Retour de la connexion après un clic sur un cœur : `?action=favori&annonce=<id>` ajoute l'annonce. */
function resumeFromLogin() {
  const url = new URL(window.location.href);
  const id = url.searchParams.get('annonce');
  if (url.searchParams.get('action') !== 'favori' || !id) return;
  url.searchParams.delete('action');
  url.searchParams.delete('annonce');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  if (!ids.has(id)) void toggleFavorite(id);
}

export async function toggleFavorite(id: string): Promise<void> {
  const on = !ids.has(id);
  const apply = (add: boolean) => {
    const next = new Set(ids);
    if (add) next.add(id);
    else next.delete(id);
    setIds(next);
  };
  apply(on); // mise à jour immédiate, annulée en cas d'échec
  try {
    await call(`/favorites/${id}`, { method: on ? 'PUT' : 'DELETE' });
  } catch {
    apply(!on);
  }
}

export function useFavoriteIds(): ReadonlySet<string> {
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
