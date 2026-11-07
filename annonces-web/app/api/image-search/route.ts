import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { BODY_TOO_LARGE, clientIp, isSameOrigin, readBody } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Recherche par image : ouverte sans compte, contrairement au relais /api/proxy. L'API limite les appels par IP. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ code: 'FORBIDDEN', message: 'Requête refusée.' }, { status: 403 });
  const body = await readBody(req);
  if (body === null) return NextResponse.json(BODY_TOO_LARGE, { status: 413 });
  const res = await fetch(`${API_URL}/listings/search-by-image`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp(req) },
    body,
    cache: 'no-store',
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
