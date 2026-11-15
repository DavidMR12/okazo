import { NextRequest, NextResponse } from 'next/server';
import { AUTO_COOKIE, formatRegion, pickRegion, REGION_COOKIE, type RegionCountry, TZ_COOKIE } from '@/lib/region';

/**
 * Accueil propre à chaque visiteur, sans casser le cache : « / » est réécrit (l'adresse ne change pas) vers
 * /accueil/<région>, une page en cache par pays et par ville. La région vient du choix du visiteur, sinon de
 * son adresse internet (en-têtes Cloudflare), sinon du fuseau horaire de son navigateur, sinon du pays par défaut.
 */
const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
let catalog: { at: number; data: RegionCountry[] } | null = null;

async function getCatalog(): Promise<RegionCountry[]> {
  if (catalog && Date.now() - catalog.at < 10 * 60_000) return catalog.data;
  try {
    const get = async <T,>(path: string) => (await (await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(3000) })).json()) as T;
    const { countries } = await get<{ countries: { code: string; name: string }[] }>('/geo/countries');
    const { cities } = await get<{ cities: { countryCode: string; slug: string; name: string }[] }>('/geo/cities');
    const data = countries.map((c) => ({
      code: c.code.toLowerCase(),
      name: c.name,
      cities: cities.filter((x) => x.countryCode === c.code && x.slug !== 'autre').map((x) => ({ slug: x.slug, name: x.name })),
    }));
    if (data.length) catalog = { at: Date.now(), data };
    return data;
  } catch {
    return catalog?.data ?? []; // API injoignable : dernière liste connue, sinon pays par défaut
  }
}

/** En-têtes Cloudflare : la ville arrive en UTF-8 lu comme du latin-1 (« YaoundÃ© »), on la remet d'aplomb. */
function header(req: NextRequest, name: string): string | null {
  const v = req.headers.get(name);
  if (!v) return null;
  try {
    return Buffer.from(v, 'latin1').toString('utf8');
  } catch {
    return v;
  }
}

export async function proxy(req: NextRequest) {
  const home = req.nextUrl.pathname === '/';
  // Ailleurs, rien à réécrire : seulement tenir à jour la région détectée, si le visiteur n'en a pas encore
  if (!home && (req.cookies.has(REGION_COOKIE) || req.cookies.has(AUTO_COOKIE))) return NextResponse.next();
  const { region, guessed } = pickRegion(
    {
      chosen: req.cookies.get(REGION_COOKIE)?.value,
      ipCountry: header(req, 'cf-ipcountry'),
      ipCity: header(req, 'cf-ipcity'),
      tz: req.cookies.get(TZ_COOKIE)?.value,
    },
    await getCatalog(),
  );
  const value = formatRegion(region);
  const res = home ? NextResponse.rewrite(new URL(`/accueil/${value}`, req.url)) : NextResponse.next();
  // Lu par le navigateur pour afficher la ville en haut de page (aucune donnée personnelle : un pays et une ville)
  res.cookies.set(AUTO_COOKIE, guessed ? `${value}!` : value, { path: '/', maxAge: 60 * 60 * 24, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https' });
  return res;
}

// Pages seulement : ni fichiers, ni relais /api, ni ressources de Next.js
export const config = { matcher: ['/((?!api/|_next/|accueil/|.*\\..*).*)'] };
