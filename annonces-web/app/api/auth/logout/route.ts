import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { clearSessionCookies, clientIp, COOKIE, isSameOrigin } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ code: 'FORBIDDEN', message: 'Requête refusée.' }, { status: 403 });
  const refreshToken = req.cookies.get(COOKIE.refresh)?.value;
  if (refreshToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp(req) },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}
