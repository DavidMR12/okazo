import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { clientIp, isSameOrigin } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ code: 'FORBIDDEN', message: 'Requête refusée.' }, { status: 403 });
  const body = await req.text();
  const res = await fetch(`${API_URL}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp(req) },
    body,
    cache: 'no-store',
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } });
}
