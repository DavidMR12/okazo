import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_COUNTRY } from '@/lib/site';

/**
 * Recherche lancée depuis l'accueil ou une page de liste : redirige vers la page du pays choisi,
 * en gardant la catégorie (et la ville, si le pays n'a pas changé : une ville appartient à son pays).
 */
export function GET(req: NextRequest) {
  // Sans JavaScript, la liste native (dernière valeur) passe après le champ caché de la liste à drapeaux
  const pays = (req.nextUrl.searchParams.getAll('pays').at(-1) ?? DEFAULT_COUNTRY).toLowerCase().replace(/[^a-z]/g, '').slice(0, 2) || DEFAULT_COUNTRY;
  const q = req.nextUrl.searchParams.get('q')?.trim().slice(0, 80);
  const slug = (v: string | null) => v?.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60) || undefined;
  const cat = slug(req.nextUrl.searchParams.get('cat'));
  const ville = slug(req.nextUrl.searchParams.get('ville'));
  const from = slug(req.nextUrl.searchParams.get('depuis')); // pays de la page d'où part la recherche
  const keepCity = ville && from === pays;
  const path = [pays, cat ?? (keepCity ? 'toutes' : undefined), keepCity ? ville : undefined].filter(Boolean).join('/');
  const url = new URL(`/${path}`, req.nextUrl.origin);
  if (q) url.searchParams.set('q', q);
  return NextResponse.redirect(url, 303);
}
