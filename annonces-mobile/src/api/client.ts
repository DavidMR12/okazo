import { router } from 'expo-router';
import { clearSession, getAccessToken, getRefreshToken, setSession } from '../auth/session';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const TIMEOUT_MS = 20_000; // réseaux lents : délai généreux mais borné

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

const networkError = () => new ApiError(0, 'NETWORK', 'Pas de connexion. Vérifiez votre réseau et réessayez.');
const notSignedIn = () => new ApiError(401, 'NOT_SIGNED_IN', 'Connectez-vous pour continuer.');

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

type RefreshResult = 'ok' | 'invalid' | 'network';
let refreshing: Promise<RefreshResult> | null = null;

/**
 * Un seul renouvellement à la fois : si 5 requêtes reçoivent un 401 en même temps,
 * elles attendent toutes le même appel. Deux renouvellements simultanés feraient réutiliser
 * un jeton déjà consommé, ce que le serveur traite comme un vol de session.
 */
export function refreshSession(): Promise<RefreshResult> {
  if (!refreshing) {
    refreshing = (async (): Promise<RefreshResult> => {
      const token = getRefreshToken();
      if (!token) return 'invalid';
      try {
        const res = await timedFetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: token }),
        });
        if (res.status === 401) {
          await clearSession();
          return 'invalid';
        }
        if (!res.ok) return 'network';
        const data = (await res.json()) as { accessToken: string; refreshToken: string };
        await setSession(data.accessToken, data.refreshToken);
        return 'ok';
      } catch {
        return 'network';
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** true : route réservée aux connectés. Les routes publiques partent sans jeton (cache CDN possible). */
  auth?: boolean;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  if (opts.auth && !getAccessToken()) {
    const r = await refreshSession();
    if (r === 'invalid') throw notSignedIn();
    if (r === 'network') throw networkError();
  }

  const send = () => {
    const token = opts.auth ? getAccessToken() : null;
    return timedFetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  };

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && opts.auth) {
      const r = await refreshSession();
      if (r === 'invalid') throw notSignedIn();
      if (r === 'network') throw networkError();
      res = await send();
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw networkError();
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { code?: string; message?: string; retryAfterSec?: number } | null;
  if (!res.ok) {
    // CGU à accepter (nouveau compte ou nouvelle version), puis numéro à vérifier (compte e-mail ou Google)
    if (res.status === 403 && data?.code === 'TERMS_REQUIRED') router.push('/accept-terms');
    if (res.status === 403 && data?.code === 'PHONE_REQUIRED') router.push('/verify-phone');
    throw new ApiError(res.status, data?.code ?? `HTTP_${res.status}`, data?.message ?? 'Une erreur est survenue. Réessayez.', data?.retryAfterSec);
  }
  return data as T;
}

export function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
