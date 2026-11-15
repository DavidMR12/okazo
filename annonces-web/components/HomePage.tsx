import Link from 'next/link';
import { CategoryGrid } from '@/components/CategoryGrid';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ListingList } from '@/components/ListingList';
import { RecentlyViewed } from '@/components/RecentlyViewed';
import { SearchForm } from '@/components/SearchForm';
import { getCategories, getCities, getListings, getPopularCategories } from '@/lib/api';
import { inCountry, placeIn } from '@/lib/region';
import type { Country, ListingsPage } from '@/lib/types';

const merge = (page: ListingsPage | null) =>
  page ? [...page.featured, ...page.items.filter((x) => !page.featured.some((f) => f.id === x.id))] : [];

/**
 * Accueil d'un pays, et par défaut d'une ville (sur le modèle de LeBonCoin, avec notre direction artistique) :
 * bandeau de recherche, grille de catégories, catégories populaires de la ville, annonces consultées,
 * dernières annonces de la ville puis du reste du pays. Aucun autre pays n'apparaît.
 */
export async function HomePage({ country, citySlug }: { country: Country; citySlug?: string }) {
  const p = country.code.toLowerCase();
  const [categories, cities] = await Promise.all([getCategories(), getCities(country.code)]);
  const city = citySlug ? cities.find((c) => c.slug === citySlug) : undefined;
  const [popular, local, national] = await Promise.all([
    getPopularCategories(country.code, city?.id),
    city ? getListings({ country: country.code, cityId: city.id, limit: 8 }).catch(() => null) : Promise.resolve(null),
    getListings({ country: country.code, limit: 16 }).catch(() => null),
  ]);
  const href = (slug?: string) => `/${p}${slug || city ? `/${slug ?? 'toutes'}` : ''}${city ? `/${city.slug}` : ''}`;
  const where = placeIn(country.name, city?.name);
  const localItems = merge(local).slice(0, 8);
  // Le reste du pays complète une ville encore peu fournie
  const elsewhere = merge(national).filter((x) => !localItems.some((l) => l.id === x.id)).slice(0, 8);

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <h1>Achetez et vendez près de chez vous</h1>
          <SearchForm action="/recherche" country={p} city={city?.slug} />
        </div>
      </section>

      <div className="container">
        <section className="section stack" aria-labelledby="h-cats">
          <h2 id="h-cats" className="visually-hidden">Catégories</h2>
          <CategoryGrid categories={categories} hrefFor={href} othersHref={`/${p}/categories`} />
        </section>

        {popular.length ? (
          <section className="section stack" aria-labelledby="h-popular">
            <div className="section-head">
              <h2 id="h-popular">Catégories populaires {where}</h2>
            </div>
            <div className="popular-grid">
              {popular.map((c) => (
                <Link key={c.id} href={href(c.slug)} className="popular-card" prefetch={false}>
                  <span className="popular-media">
                    <CategoryIcon slug={c.slug} size={24} />
                  </span>
                  <span className="popular-body">
                    <strong>{c.name}</strong>
                    <span className="muted">{c.count.toLocaleString('fr-FR')} annonce{c.count > 1 ? 's' : ''}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <RecentlyViewed />

        {localItems.length ? (
          <section className="section stack" aria-labelledby="h-local">
            <div className="section-head">
              <h2 id="h-local">Dernières annonces {where}</h2>
              <Link href={href()} className="see-all">Voir tout ›</Link>
            </div>
            <ListingList items={localItems} />
          </section>
        ) : null}

        {elsewhere.length ? (
          <section className="section stack" aria-labelledby="h-country">
            <div className="section-head">
              <h2 id="h-country">{city ? `Ailleurs ${inCountry(country.name)}` : `Dernières annonces ${inCountry(country.name)}`}</h2>
              <Link href={`/${p}`} className="see-all">Voir tout ›</Link>
            </div>
            <ListingList items={elsewhere} />
          </section>
        ) : null}
      </div>
    </>
  );
}
