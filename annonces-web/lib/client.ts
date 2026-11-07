'use client';

import { useSyncExternalStore } from 'react';

export class ClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

/** Appel authentifié depuis le navigateur : passe par le relais /api/proxy (cookies httpOnly). */
export async function call<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/proxy${path}`, {
      method: opts.method ?? 'GET',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ClientError(0, 'NETWORK', 'Pas de connexion. Vérifiez votre réseau et réessayez.');
  }
  if (res.status === 401) notifyAuthChange();
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
  // CGU pas encore acceptées (ou nouvelle version) : page d'acceptation, puis retour ici
  if (res.status === 403 && data?.code === 'TERMS_REQUIRED' && !window.location.pathname.startsWith('/conditions/accepter')) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/conditions/accepter?retour=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
  if (res.status === 403 && data?.code === 'PHONE_REQUIRED' && !window.location.pathname.startsWith('/verifier-numero')) {
    // Hors composant (fonction utilitaire) : pas de routeur disponible, navigation classique
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/verifier-numero?retour=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
  if (!res.ok) throw new ClientError(res.status, data?.code ?? `HTTP_${res.status}`, data?.message ?? 'Une erreur est survenue. Réessayez.');
  return data as T;
}

/** Appel direct à une route /api/auth/… du site. */
export async function authCall<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      credentials: 'same-origin',
    });
  } catch {
    throw new ClientError(0, 'NETWORK', 'Pas de connexion. Vérifiez votre réseau et réessayez.');
  }
  const data = (await res.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!res.ok) throw new ClientError(res.status, data?.code ?? `HTTP_${res.status}`, data?.message ?? 'Une erreur est survenue. Réessayez.');
  notifyAuthChange();
  return data as T;
}

// ---- état « connecté » (lu depuis le cookie non secret app_in) ----
const AUTH_EVENT = 'app-auth';
export const notifyAuthChange = () => window.dispatchEvent(new Event(AUTH_EVENT));

const readSignedIn = () => document.cookie.split('; ').some((c) => c === 'app_in=1');

export function useSignedIn(): boolean | null {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(AUTH_EVENT, cb);
      window.addEventListener('focus', cb);
      return () => {
        window.removeEventListener(AUTH_EVENT, cb);
        window.removeEventListener('focus', cb);
      };
    },
    readSignedIn,
    () => null, // rendu serveur : inconnu
  );
}

/** Redirection interne uniquement (empêche ?retour=https://site-malveillant). */
export const safeReturn = (to: string | undefined | null) => {
  // Les navigateurs lisent « /\\site.com » comme « //site.com » et ignorent tabulations et retours à la ligne
  if (!to || !to.startsWith('/') || /[\\\u0000-\u001f]/.test(to)) return '/';
  try {
    return new URL(to, 'http://x').origin === 'http://x' ? to : '/';
  } catch {
    return '/';
  }
};
