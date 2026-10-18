import type { MetadataRoute } from 'next';
import { getCategories, getCities, getCountries, getSitemapListings } from '@/lib/api';
import { listingPath } from '@/lib/format';
import { SITE_URL } from '@/lib/site';

// Généré à la demande (jamais figé vide au moment de la construction) ; les données restent en cache 1 h
export const dynamic = 'force-dynamic';

/**
 * Plan du site : pages pays, catégories, catégories × villes, puis les 5 000 annonces les plus récentes.
 * Google découvre les plus anciennes en parcourant les pages de catégories.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [countries, categories, listings] = await Promise.all([getCountries(), getCategories(), getSitemapListings()]);
  const entries: MetadataRoute.Sitemap = [{ url: SITE_URL, changeFrequency: 'hourly', priority: 1 }];

  for (const country of countries) {
    const pays = country.code.toLowerCase();
    const cities = await getCities(pays);
    entries.push({ url: `${SITE_URL}/${pays}`, changeFrequency: 'hourly', priority: 0.9 });
    for (const city of cities) entries.push({ url: `${SITE_URL}/${pays}/toutes/${city.slug}`, changeFrequency: 'hourly', priority: 0.8 });
    for (const cat of categories) {
      for (const c of [cat, ...(cat.children ?? [])]) {
        entries.push({ url: `${SITE_URL}/${pays}/${c.slug}`, changeFrequency: 'hourly', priority: 0.7 });
        for (const city of cities) entries.push({ url: `${SITE_URL}/${pays}/${c.slug}/${city.slug}`, changeFrequency: 'daily', priority: 0.6 });
      }
    }
  }

  for (const l of listings) {
    entries.push({ url: `${SITE_URL}${listingPath(l)}`, lastModified: l.updatedAt, changeFrequency: 'weekly', priority: 0.5 });
  }
  return entries;
}
