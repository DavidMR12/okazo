/**
 * Région du visiteur (comme Uber) : chacun ne voit que SON pays, et par défaut SA ville.
 * Ordre : choix du visiteur (cookie okazo_region) → adresse internet (en-têtes Cloudflare CF-IPCountry / CF-IPCity)
 * → fuseau horaire du navigateur (cookie okazo_region_tz, posé par RegionBar) → pays par défaut.
 * Les autres pays ne sont jamais proposés. Pas de pays « courant » côté serveur : la région voyage avec chaque requête.
 * Fichier commun au serveur, au relais (proxy.ts) et au navigateur.
 */
import { DEFAULT_COUNTRY } from './site';

export const REGION_COOKIE = 'okazo_region'; // choix du visiteur : « cm » (tout le pays) ou « cm.douala »
export const AUTO_COOKIE = 'okazo_region_auto'; // région détectée, lue par le navigateur ; « ! » final = supposée
export const TZ_COOKIE = 'okazo_region_tz'; // pays du fuseau horaire, quand l'adresse internet ne suffit pas
export const ABROAD_COOKIE = 'okazo_abroad'; // « 1 » : visiteur hors des pays ouverts, qui a choisi son pays (il peut en changer)
export const REGION_MAX_AGE = 60 * 60 * 24 * 400; // 400 jours, maximum des navigateurs

export interface Region { country: string; city?: string } // codes en minuscules : { country: 'cm', city: 'douala' }
export interface RegionCountry { code: string; name: string; cities: { slug: string; name: string }[] }

/** Ville principale de chaque pays : ville par défaut quand l'adresse internet ne donne pas la ville. */
export const MAIN_CITY: Record<string, string> = { cm: 'douala', ga: 'libreville', cg: 'brazzaville', td: 'ndjamena', cf: 'bangui', gq: 'malabo' };

/** Fuseaux horaires des pays de la zone (un seul pays par fuseau). */
export const TZ_COUNTRY: Record<string, string> = {
  'Africa/Douala': 'cm',
  'Africa/Libreville': 'ga',
  'Africa/Brazzaville': 'cg',
  'Africa/Ndjamena': 'td',
  'Africa/Bangui': 'cf',
  'Africa/Malabo': 'gq',
};

export function parseRegion(v?: string | null): Region | null {
  const m = /^([a-z]{2})(?:\.([a-z0-9-]{1,60}))?!?$/.exec((v ?? '').trim().toLowerCase());
  return m ? { country: m[1], city: m[2] } : null;
}
export const formatRegion = (r: Region) => (r.city ? `${r.country}.${r.city}` : r.country);
export const isGuess = (v?: string | null) => !!v?.endsWith('!');

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Garde une région seulement si son pays est ouvert et sa ville connue (sinon tout le pays). */
export function validRegion(r: Region | null, catalog: RegionCountry[]): Region | null {
  const c = r && catalog.find((x) => x.code === r.country);
  if (!r || !c) return null;
  return { country: r.country, city: r.city && c.cities.some((x) => x.slug === r.city) ? r.city : undefined };
}

/** Ville par défaut d'un pays : celle de l'adresse internet si on la connaît, sinon la ville principale. */
function defaultCity(c: RegionCountry, ipCity?: string): string | undefined {
  const wanted = ipCity ? plain(ipCity) : '';
  const fromIp = wanted ? c.cities.find((x) => x.slug === wanted || plain(x.name) === wanted) : undefined;
  return fromIp?.slug ?? c.cities.find((x) => x.slug === MAIN_CITY[c.code])?.slug ?? c.cities[0]?.slug;
}

/** Région à afficher, et si elle n'est qu'une supposition (aucun indice sur le pays). */
export function pickRegion(
  input: { chosen?: string | null; ipCountry?: string | null; ipCity?: string | null; tz?: string | null },
  catalog: RegionCountry[],
): { region: Region; guessed: boolean } {
  const chosen = validRegion(parseRegion(input.chosen), catalog);
  if (chosen) return { region: chosen, guessed: false };
  const byIp = catalog.find((c) => c.code === input.ipCountry?.toLowerCase());
  if (byIp) return { region: { country: byIp.code, city: defaultCity(byIp, input.ipCity ?? undefined) }, guessed: false };
  const byTz = catalog.find((c) => c.code === input.tz?.toLowerCase());
  if (byTz) return { region: { country: byTz.code, city: defaultCity(byTz) }, guessed: false };
  const fallback = catalog.find((c) => c.code === DEFAULT_COUNTRY) ?? catalog[0];
  if (!fallback) return { region: { country: DEFAULT_COUNTRY }, guessed: true };
  return { region: { country: fallback.code, city: defaultCity(fallback) }, guessed: true };
}

/** « au Cameroun », « en Centrafrique », « en Guinée équatoriale ». */
export function inCountry(name: string): string {
  return /^(centrafrique|guinée|côte)/i.test(name) ? `en ${name}` : `au ${name.replace(/\s*\(.*\)$/, '')}`;
}
/** « à Douala » ou « au Cameroun ». */
export const placeIn = (countryName: string, cityName?: string) => (cityName ? `à ${cityName}` : inCountry(countryName));

/** Lecture d'un cookie dans le navigateur. */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
export function writeCookie(name: string, value: string, maxAge = REGION_MAX_AGE) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
/** Région du visiteur vue du navigateur : son choix, sinon celle détectée par le serveur. */
export function browserRegion(): Region | null {
  return parseRegion(readCookie(REGION_COOKIE)) ?? parseRegion(readCookie(AUTO_COOKIE));
}
