import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { clientIp, deviceId, isSameOrigin, readJson, setSessionCookies } from '@/lib/session';

/**
 * Connexion par e-mail et mot de passe, relayée vers l'API :
 * - register, forgot : envoi d'un code par e-mail (aucune session) ;
 * - verify, login, reset : ouvrent une session, dont les jetons partent en cookies httpOnly (jamais vers la page).
 */
const SESSION = new Set(['verify', 'login', 'reset']);
const PLAIN = new Set(['register', 'forgot']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!isSameOrigin(req)) return NextResponse.json({ code: 'FORBIDDEN', message: 'Requête refusée.' }, { status: 403 });
  if (!SESSION.has(action) && !PLAIN.has(action)) return NextResponse.json({ code: 'NOT_FOUND', message: 'Introuvable.' }, { status: 404 });
  const input = (await readJson(req)) as Record<string, unknown>;

  const out = NextResponse.json({});
  const body = SESSION.has(action) ? { ...input, device: { fingerprint: `web:${deviceId(req, out)}`, platform: 'web' } } : input;
  const res = await fetch(`${API_URL}/auth/email/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp(req) },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json(data ?? { message: 'Action impossible.' }, { status: res.status });
  if (!SESSION.has(action)) return NextResponse.json(data);

  const response = NextResponse.json({ user: data.user, isNewUser: data.isNewUser, phoneRequired: data.phoneRequired });
  out.cookies.getAll().forEach((c) => response.cookies.set(c));
  setSessionCookies(response, { accessToken: data.accessToken, refreshToken: data.refreshToken });
  return response;
}
