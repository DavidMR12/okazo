import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { clearSessionCookies, clientIp, COOKIE, isSameOrigin, refreshTokens, setSessionCookies, Tokens } from '@/lib/session';

export const dynamic = 'force-dynamic';

const signedOut = () => {
  const res = NextResponse.json({ code: 'NOT_SIGNED_IN', message: 'Connectez-vous pour continuer.' }, { status: 401 });
  clearSessionCookies(res);
  return res;
};

/**
 * Relais authentifié navigateur → API. Ajoute le jeton depuis le cookie httpOnly, le renouvelle
 * si besoin, et transmet l'IP du visiteur. L'API reste seule juge des autorisations.
 */
async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.some((s) => s === '.' || s === '..' || s === '')) {
    return NextResponse.json({ code: 'BAD_PATH', message: 'Chemin invalide.' }, { status: 400 });
  }
  if (req.method !== 'GET' && !isSameOrigin(req)) {
    return NextResponse.json({ code: 'FORBIDDEN', message: 'Requête refusée.' }, { status: 403 });
  }

  const refresh = req.cookies.get(COOKIE.refresh)?.value;
  let access = req.cookies.get(COOKIE.access)?.value;
  if (!refresh && !access) return signedOut();

  const ip = clientIp(req);
  const target = `${API_URL}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();

  const forward = (token: string) =>
    fetch(target, {
      method: req.method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Forwarded-For': ip,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body || undefined,
      cache: 'no-store',
    });

  let renewed: Tokens | null = null;
  if (!access) {
    renewed = refresh ? await refreshTokens(refresh, ip) : null;
    if (!renewed) return signedOut();
    access = renewed.accessToken;
  }

  let res = await forward(access);
  if (res.status === 401 && refresh && !renewed) {
    renewed = await refreshTokens(refresh, ip);
    if (!renewed) return signedOut();
    res = await forward(renewed.accessToken);
  }

  const out = new NextResponse(res.status === 204 ? null : await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'private, no-store' },
  });
  if (renewed) setSessionCookies(out, renewed);
  if (res.status === 401) clearSessionCookies(out);
  return out;
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
