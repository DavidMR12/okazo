import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { clientIp, deviceId, isSameOrigin, readJson, setSessionCookies } from '@/lib/session';

/** Connexion avec Google ou Facebook : le jeton du fournisseur est vérifié par l'API, la session posée en cookies httpOnly. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ code: 'FORBIDDEN', message: 'Requête refusée.' }, { status: 403 });
  const input = (await readJson(req)) as { provider?: string; token?: string; country?: string };

  const out = NextResponse.json({});
  const did = deviceId(req, out);

  const res = await fetch(`${API_URL}/auth/oauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp(req) },
    body: JSON.stringify({ provider: input.provider, token: input.token, country: input.country, device: { fingerprint: `web:${did}`, platform: 'web' } }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json(data ?? { message: 'Connexion impossible.' }, { status: res.status });

  const response = NextResponse.json({ user: data.user, isNewUser: data.isNewUser, phoneRequired: data.phoneRequired });
  out.cookies.getAll().forEach((c) => response.cookies.set(c));
  setSessionCookies(response, { accessToken: data.accessToken, refreshToken: data.refreshToken });
  return response;
}
