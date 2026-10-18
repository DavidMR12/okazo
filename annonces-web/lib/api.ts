import 'server-only';
import type { Category, City, Country, District, ListingDetail, ListingsPage, ReviewsPage, SellerProfile } from './types';

export const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Lecture publique côté serveur. Les réponses sont gardées dans le cache de données de Next.js
 * (`revalidate`, en secondes) : une page consultée 1 000 fois par minute n'interroge l'API qu'une fois.
 */
// Pendant `next build`, l'API peut être injoignable (construction de l'image Docker) : les pages
// pré-générées sortent vides et se régénèrent à la première visite après le déploiement.
const BUILDING = process.env.NEXT_PHASE === 'phase-production-build';

async function get<T>(path: string, revalidate: number): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: { Accept: 'application/json' }, next: { revalidate } });
  } catch (err) {
    if (BUILDING) return null;
    throw err;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    if (BUILDING) return null;
    throw new Error(`API ${res.status} sur ${path}`);
  }
  return (await res.json()) as T;
}

const qs = (p: Record<string, string | number | undefined>) => {
  const s = Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};

const HOUR = 3600;

export const getCountries = async () => (await get<{ countries: Country[] }>('/geo/countries', HOUR))?.countries ?? [];
export const getCities = async (country: string) =>
  (await get<{ cities: City[] }>(`/geo/cities${qs({ country: country.toUpperCase() })}`, HOUR))?.cities ?? [];
export const getCategories = async () => (await get<{ categories: Category[] }>('/categories', HOUR))?.categories ?? [];

type ListingQuery = { country?: string; categoryId?: number; cityId?: number; q?: string; cursor?: string; sellerId?: string; limit?: number };
// filters : tri, prix, état, type et champs de catégorie (voir lib/searchParams.ts)
type Filters = Record<string, string | number | undefined>;

export const getListings = (p: ListingQuery, filters: Filters = {}) =>
  get<ListingsPage>(`/listings${qs({ ...filters, ...p, country: p.country?.toUpperCase(), limit: p.limit ?? 24 })}`, 30);

/** Nombre de résultats d'une recherche (« 124 annonces »). */
export const getListingCount = async (p: ListingQuery, filters: Filters = {}) =>
  (await get<{ count: number }>(`/listings/count${qs({ ...filters, ...p, country: p.country?.toUpperCase(), cursor: undefined, limit: undefined })}`, 30))?.count ?? null;

export const getListing = (id: string) => get<ListingDetail>(`/listings/${id}`, 60);
export const getDistricts = async (cityId: number) => (await get<{ districts: District[] }>(`/geo/districts?cityId=${cityId}`, HOUR))?.districts ?? [];
/** « Catégories populaires » de l'accueil (nombre d'annonces en ligne et photo récente). */
export const getPopularCategories = async (country: string) =>
  (await get<{ categories: { id: number; slug: string; name: string; count: number; imageUrl: string | null }[] }>(`/categories/popular?country=${country.toUpperCase()}`, 300))?.categories ?? [];
/** Modes de connexion proposés (SMS ou WhatsApp, Google, Facebook). */
export const getAuthMethods = async () =>
  (await get<{ otpChannels: ('sms' | 'whatsapp')[]; google: boolean; facebook: boolean; email?: boolean }>('/auth/methods', 300)) ?? { otpChannels: ['sms' as const], google: false, facebook: false, email: true };
export const getSeller = (id: string) => get<SellerProfile>(`/users/${id}`, 120);
export const getSellerReviews = (id: string) => get<ReviewsPage>(`/users/${id}/reviews`, 120);
export const getSitemapListings = async () =>
  (await get<{ items: { id: string; title: string; updatedAt: string }[] }>('/listings/sitemap', HOUR))?.items ?? [];

/** Catégorie par son identifiant de lien (parent ou sous-catégorie), avec son parent éventuel. */
export function findCategory(tree: Category[], pred: (c: Category) => boolean): { category: Category; parent?: Category } | null {
  for (const root of tree) {
    if (pred(root)) return { category: root };
    const child = root.children?.find(pred);
    if (child) return { category: child, parent: root };
  }
  return null;
}
