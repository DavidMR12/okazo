import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { clientIp, deviceId, isSameOrigin, readJson, setSessionCookies } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ code: 'FORBIDDEN', message: 'Requête refusée.' }, { status: 403 });
  const input = (await readJson(req)) as { phone?: string; code?: string };

  const out = NextResponse.json({});
  const did = deviceId(req, out);

  const res = await fetch(`${API_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp(req) },
    body: JSON.stringify({ phone: input.phone, code: input.code, device: { fingerprint: `web:${did}`, platform: 'web' } }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json(data ?? { message: 'Vérification impossible.' }, { status: res.status });

  // Les jetons ne sont jamais renvoyés à la page : uniquement placés en cookies httpOnly
  const response = NextResponse.json({ user: data.user, isNewUser: data.isNewUser });
  out.cookies.getAll().forEach((c) => response.cookies.set(c));
  setSessionCookies(response, { accessToken: data.accessToken, refreshToken: data.refreshToken });
  return response;
}
