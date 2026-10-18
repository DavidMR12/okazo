import type { PriceType } from '../api/types';

// Espace insécable (U+00A0) : Roboto Slab n'a pas l'espace fine insécable (U+202F),
// qui s'afficherait avec une autre police, voire comme un carré vide sur certains téléphones.
const NBSP = '\u00A0';

export function formatXaf(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}${NBSP}FCFA`;
}

/** Pastilles des catégories principales : « Maison et jardin » devient « Maison » (maquettes). */
export const shortCategory = (name: string) => name.replace(/ et .*$/, '');

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
  if (min < 1) return "à l’instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  return `le ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function memberSince(iso: string): string {
  const d = new Date(iso);
  return `Membre depuis ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export const CONDITION_LABELS: Record<string, string> = {
  new: 'Neuf',
  like_new: 'Comme neuf',
  good: 'Bon état',
  fair: 'État correct',
  for_parts: 'Pour pièces',
};

/** Rôle de l'auteur d'un avis : Recruteur / Candidat pour une offre d'emploi, Vendeur / Acheteur sinon. */
export const reviewRoleLabel = (role: 'buyer' | 'seller', parentSlug?: string | null) =>
  parentSlug === 'emploi' ? (role === 'seller' ? 'Recruteur' : 'Candidat') : role === 'seller' ? 'Vendeur' : 'Acheteur';

/** Lieu affiché : « Akwa, Douala », ou la ville seule si le quartier n'est pas indiqué. */
export const placeLabel = (city: string, district?: string | null) => (district ? `${district}, ${city}` : city);
