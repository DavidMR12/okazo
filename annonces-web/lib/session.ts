import 'server-only';
import { randomUUID } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { API_URL } from './api';

/**
 * Session web : les jetons restent dans des cookies httpOnly, illisibles par le JavaScript de la page
 * (un script injecté ne peut pas les voler). Le navigateur appelle /api/… sur le même domaine,
 * et le serveur Next.js relaie vers l'API avec le jeton.
 */
const secure = process.env.NODE_ENV === 'production';
export const COOKIE = { access: 'app_at', refresh: 'app_rt', signedIn: 'app_in', device: 'app_did' } as const;

export interface Tokens { accessToken: string; refreshToken: string }

export function setSessionCookies(res: NextResponse, t: Tokens) {
  const base = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/api' };
  res.cookies.set(COOKIE.access, t.accessToken, { ...base, maxAge: 14 * 60 }); // jeton de 15 min côté API
  res.cookies.set(COOKIE.refresh, t.refreshToken, { ...base, maxAge: 30 * 86400 });
  // Indicateur lisible par la page, sans valeur secrète : sert seulement à afficher « Mon compte »
  res.cookies.set(COOKIE.signedIn, '1', { secure, sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.set(COOKIE.access, '', { path: '/api', maxAge: 0 });
  res.cookies.set(COOKIE.refresh, '', { path: '/api', maxAge: 0 });
  res.cookies.set(COOKIE.signedIn, '', { path: '/', maxAge: 0 });
}

/**
 * Identifiant d'appareil du navigateur (signal anti-fraude, facile à effacer : l'API ne s'y fie pas seul).
 */
export function deviceId(req: NextRequest, res: NextResponse): string {
  let id = req.cookies.get(COOKIE.device)?.value;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id = randomUUID();
    res.cookies.set(COOKIE.device, id, { httpOnly: true, secure, sameSite: 'lax', path: '/api', maxAge: 2 * 365 * 86400 });
  }
  return id;
}

/** IP réelle du visiteur, transmise à l'API pour ses limites anti-abus (sinon tous les visiteurs auraient l'IP du serveur). */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0'
  );
}

/** Refuse les requêtes d'écriture venant d'un autre site (protection CSRF, en plus de SameSite=Lax). */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

// Un seul renouvellement par jeton, partagé par les requêtes simultanées du même visiteur.
// Le résultat est gardé 10 s : une requête partie avec l'ancien cookie reçoit les nouveaux jetons
// au lieu de réutiliser un jeton déjà consommé (que l'API traiterait comme un vol).
// Limite : valable pour une instance Next.js ; avec plusieurs instances, activer l'affinité de session.
const inflight = new Map<string, Promise<Tokens | null>>();

export function refreshTokens(refreshToken: string, ip: string): Promise<Tokens | null> {
  let p = inflight.get(refreshToken);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
          body: JSON.stringify({ refreshToken }),
          cache: 'no-store',
        });
        if (!res.ok) return null;
        return (await res.json()) as Tokens;
      } catch {
        return null;
      }
    })();
    inflight.set(refreshToken, p);
    void p.finally(() => setTimeout(() => inflight.delete(refreshToken), 10_000));
  }
  return p;
}
