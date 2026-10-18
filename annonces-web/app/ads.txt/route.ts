import { ADSENSE_CLIENT } from '@/lib/site';

// Fichier exigé par Google AdSense : déclare le site comme vendeur autorisé de son espace publicitaire
export function GET() {
  const pub = ADSENSE_CLIENT.replace(/^ca-/, '');
  const body = pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : '';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}
