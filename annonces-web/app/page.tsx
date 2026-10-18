import Link from 'next/link';
import { CategoryGrid } from '@/components/CategoryGrid';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ListingList } from '@/components/ListingList';
import { RecentlyViewed } from '@/components/RecentlyViewed';
import { SearchForm } from '@/components/SearchForm';
import { getCategories, getCountries, getListings, getPopularCategories } from '@/lib/api';
import { DEFAULT_COUNTRY } from '@/lib/site';

export const revalidate = 60;

/**
 * Accueil, sur le modèle de LeBonCoin avec notre direction artistique : bandeau de recherche,
 * grille de catégories, catégories populaires, annonces consultées, puis les dernières annonces de chaque pays.
 */
export default async function Home() {
  const [countries, categories, popular] = await Promise.all([getCountries(), getCategories(), getPopularCategories(DEFAULT_COUNTRY)]);
  const latest = await Promise.all(countries.map((c) => getListings({ country: c.code, limit: 8 }).catch(() => null)));
  const country = countries.find((c) => c.code.toLowerCase() === DEFAULT_COUNTRY);

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <h1>Achetez et vendez près de chez vous</h1>
          <SearchForm action="/recherche" countries={countries} country={DEFAULT_COUNTRY} />
        </div>
      </section>

      <div className="container">
        <section className="section stack" aria-labelledby="h-cats">
          <h2 id="h-cats" className="visually-hidden">Catégories</h2>
          <CategoryGrid categories={categories} hrefFor={(slug) => (slug ? `/${DEFAULT_COUNTRY}/${slug}` : `/${DEFAULT_COUNTRY}`)} othersHref={`/${DEFAULT_COUNTRY}/categories`} />
        </section>

        {popular.length ? (
          <section className="section stack" aria-labelledby="h-popular">
            <div className="section-head">
              <h2 id="h-popular">Catégories populaires{country ? ` : ${country.name}` : ''}</h2>
            </div>
            <div className="popular-grid">
              {popular.map((c) => (
                <Link key={c.id} href={`/${DEFAULT_COUNTRY}/${c.slug}`} className="popular-card" prefetch={false}>
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

        {countries.map((c, i) => {
          const page = latest[i];
          const items = page ? [...page.featured, ...page.items.filter((x) => !page.featured.some((f) => f.id === x.id))].slice(0, 8) : [];
          if (!items.length) return null;
          return (
            <section key={c.code} className="section stack" aria-labelledby={`h-${c.code}`}>
              <div className="section-head">
                <h2 id={`h-${c.code}`}>Dernières annonces : {c.name}</h2>
                <Link href={`/${c.code.toLowerCase()}`} className="see-all">Voir tout ›</Link>
              </div>
              <ListingList items={items} />
            </section>
          );
        })}
      </div>
    </>
  );
}
