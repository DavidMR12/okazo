import type { PriceType } from './types';

const NNBSP = '\u202F';
export const formatXaf = (n: number) =>
  `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP)}${NNBSP}FCFA`;

export function priceLabel(priceType: PriceType, priceXaf: number | null): string {
  if (priceType === 'free') return 'Gratuit';
  if (priceType === 'contact' || priceXaf === null) return 'Prix sur demande';
  return formatXaf(priceXaf);
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 60) return min < 1 ? "à l'instant" : `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  return `le ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const memberSince = (iso: string) => {
  const d = new Date(iso);
  return `Membre depuis ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const CONDITION_LABELS: Record<string, string> = {
  new: 'Neuf',
  like_new: 'Comme neuf',
  good: 'Bon état',
  fair: 'État correct',
  for_parts: 'Pour pièces',
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL lisible pour Google : /annonce/samsung-galaxy-a15-128-go-<uuid> */
export const listingPath = (l: { id: string; title: string }) => {
  const slug = slugify(l.title);
  return `/annonce/${slug ? `${slug}-` : ''}${l.id}`;
};

export const idFromSlug = (slug: string): string | null => slug.match(UUID_RE)?.[0].toLowerCase() ?? null;

/** Rôle de l'auteur d'un avis : Recruteur / Candidat pour une offre d'emploi, Vendeur / Acheteur sinon. */
export const reviewRoleLabel = (role: 'buyer' | 'seller', parentSlug?: string | null) =>
  parentSlug === 'emploi' ? (role === 'seller' ? 'Recruteur' : 'Candidat') : role === 'seller' ? 'Vendeur' : 'Acheteur';

/** Lieu affiché : « Akwa, Douala », ou la ville seule si le quartier n'est pas indiqué. */
export const placeLabel = (city: string, district?: string | null) => (district ? `${district}, ${city}` : city);
