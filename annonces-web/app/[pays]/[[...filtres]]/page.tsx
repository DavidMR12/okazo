import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListingList } from '@/components/ListingList';
import { SearchForm } from '@/components/SearchForm';
import { CategoryGrid } from '@/components/CategoryGrid';
import { FiltersForm } from '@/components/FiltersForm';
import { SaveSearchButton } from '@/components/SaveSearchButton';
import { findCategory, getCategories, getCities, getCountries, getDistricts, getListingCount, getListings } from '@/lib/api';
import { formatXaf } from '@/lib/format';
import { apiFilters, hasFilters, PageParams, pageParams } from '@/lib/searchParams';
import type { Category, CategoryForm, City, Country } from '@/lib/types';
import { walletName } from '@/components/Wallets';

type Params = Promise<{ pays: string; filtres?: string[] }>;
type Search = Promise<PageParams>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Pages de liste indexables : /cm, /cm/telephones, /cm/telephones/douala, /cm/toutes/douala.
 * Chaque combinaison catégorie × ville est une page à part entière pour Google.
 */
async function resolve(pays: string, filtres: string[]) {
  if (filtres.length > 2) return null;
  const countries = await getCountries();
  const country = countries.find((c) => c.code.toLowerCase() === pays.toLowerCase());
  if (!country) return null;

  const [categories, cities] = await Promise.all([getCategories(), getCities(country.code)]);
  const [catSlug, citySlug] = filtres;
  const found = catSlug && catSlug !== 'toutes' ? findCategory(categories, (c) => c.slug === catSlug) : null;
  if (catSlug && catSlug !== 'toutes' && !found) return null;
  const city = citySlug ? cities.find((c) => c.slug === citySlug) : undefined;
  if (citySlug && !city) return null;

  return { country, countries, categories, cities, category: found?.category, parent: found?.parent, city };
}

/** Résumé des filtres : « moins de 5 000 000 FCFA · Toyota · demandes ». */
function describeFilters(f: Record<string, string | number | undefined>, form?: CategoryForm): string {
  const parts: string[] = [];
  for (const field of form?.fields ?? []) {
    const v = f[`a_${field.key}`];
    if (field.type === 'select' && v) parts.push(String(v).split(',').map((x) => field.options.find((o) => o.value === x)?.label ?? x).join(' ou '));
    if (field.type === 'number') {
      const min = f[`a_${field.key}_min`];
      const max = f[`a_${field.key}_max`];
      if (min) parts.push(`${field.label.toLowerCase()} dès ${min}${field.unit ? ` ${field.unit}` : ''}`);
      if (max) parts.push(`${field.label.toLowerCase()} jusqu’à ${max}${field.unit ? ` ${field.unit}` : ''}`);
    }
  }
  if (f.minPrice !== undefined && f.maxPrice !== undefined) parts.push(`${formatXaf(Number(f.minPrice))} à ${formatXaf(Number(f.maxPrice))}`);
  else if (f.maxPrice !== undefined) parts.push(`moins de ${formatXaf(Number(f.maxPrice))}`);
  else if (f.minPrice !== undefined) parts.push(`plus de ${formatXaf(Number(f.minPrice))}`);
  if (f.adType === 'request') parts.push('demandes');
  if (f.handDelivery) parts.push('remise en main propre');
  if (f.wallet) parts.push(`paiement ${walletName(String(f.wallet))}`);
  return parts.join(' · ');
}

const href = (pays: string, cat?: string, city?: string) =>
  `/${pays}${cat || city ? `/${cat ?? 'toutes'}` : ''}${city ? `/${city}` : ''}`;

function heading(country: Country, category?: Category, city?: City, q?: string) {
  const where = city ? `à ${city.name}` : `au ${country.name}`; // Cameroun, Gabon, Congo : tous masculins
  const what = category ? category.name : 'Annonces';
  return q ? `« ${q} » ${where}` : `${what} ${where}`;
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const { pays, filtres = [] } = await params;
  const sp = await searchParams;
  const ctx = await resolve(pays, filtres);
  if (!ctx) return {};
  const q = one(sp.q);
  const apres = one(sp.apres);
  const title = heading(ctx.country, ctx.category, ctx.city, q);
  const canonical = href(pays.toLowerCase(), ctx.category?.slug, ctx.city?.slug);
  return {
    title,
    description: `${title} : petites annonces entre particuliers, vérifiées avant publication. Contactez les vendeurs par WhatsApp.`,
    alternates: { canonical: apres ? `${canonical}?apres=${encodeURIComponent(apres)}` : canonical },
    // Recherche libre et pages filtrées : non indexées (contenu mince et infini)
    robots: q || hasFilters(apiFilters(sp)) ? { index: false, follow: true } : undefined,
  };
}

export default async function ListPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { pays, filtres = [] } = await params;
  const sp = await searchParams;
  const ctx = await resolve(pays, filtres);
  if (!ctx) return notFound();
  const p = ctx.country.code.toLowerCase();
  if (pays !== p) return notFound();

  const q = one(sp.q)?.trim().slice(0, 80) || undefined;
  const apres = one(sp.apres);
  const filters = apiFilters(sp);
  // Quartiers : seulement dans une ville (un quartier d'une autre ville est ignoré)
  const districts = ctx.city ? await getDistricts(ctx.city.id) : [];
  if (!districts.some((d) => d.id === filters.districtId)) filters.districtId = undefined;
  const base = { country: ctx.country.code, categoryId: ctx.category?.id, cityId: ctx.city?.id, q: q && q.length >= 2 ? q : undefined };
  const [page, count] = await Promise.all([
    getListings({ ...base, cursor: apres }, filters).catch(() => null),
    getListingCount(base, filters).catch(() => null),
  ]);
  if (!page) return notFound();
  const form = ctx.category?.form;
  const byPrice = filters.sort === 'price_asc' || filters.sort === 'price_desc';

  const items = apres ? page.items : [...page.featured, ...page.items.filter((x) => !page.featured.some((f) => f.id === x.id))];
  const root = ctx.parent ?? ctx.category;
  const listHref = href(p, ctx.category?.slug, ctx.city?.slug);
  // Les filtres et le tri suivent la pagination
  const nextParams = pageParams({ ...filters, q });
  if (page.nextCursor) nextParams.set('apres', page.nextCursor);
  const nextHref = page.nextCursor ? `${listHref}?${nextParams}` : null;

  return (
    <div className="container">
      <nav className="breadcrumb" aria-label="Fil d'Ariane">
        <ol>
          <li><Link href="/">Accueil</Link></li>
          <li><Link href={`/${p}`}>{ctx.country.name}</Link></li>
          {ctx.parent ? <li><Link href={href(p, ctx.parent.slug, ctx.city?.slug)}>{ctx.parent.name}</Link></li> : null}
          {ctx.category ? <li aria-current="page">{ctx.category.name}</li> : null}
        </ol>
      </nav>

      <section className="section stack">
        <h1>{heading(ctx.country, ctx.category, ctx.city, q)}</h1>
        {/* Même en-tête que l'accueil : recherche avec le choix du pays, puis la grille d'icônes */}
        <SearchForm action="/recherche" defaultQuery={q} countries={ctx.countries} country={p} category={ctx.category?.slug} city={ctx.city?.slug} />

        <CategoryGrid categories={ctx.categories} hrefFor={(slug) => href(p, slug, ctx.city?.slug)} othersHref={`/${p}/categories`} currentId={root?.id} showAll />
        {root?.children?.length ? (
          <nav className="chips" aria-label={`Sous-catégories de ${root.name}`}>
            {root.children.map((c) => (
              <Link key={c.id} href={href(p, c.slug, ctx.city?.slug)} className="chip" aria-current={ctx.category?.id === c.id ? 'page' : undefined}>
                {c.name}
              </Link>
            ))}
          </nav>
        ) : null}
        <nav className="chips" aria-label="Villes">
          <Link href={href(p, ctx.category?.slug)} className="chip" aria-current={!ctx.city ? 'page' : undefined}>Tout le pays</Link>
          {ctx.cities.map((c) => (
            <Link key={c.id} href={href(p, ctx.category?.slug, c.slug)} className="chip" aria-current={ctx.city?.id === c.id ? 'page' : undefined}>
              {c.name}
            </Link>
          ))}
        </nav>
        <div className="results-bar">
          {count !== null ? <p className="muted" style={{ margin: 0 }}>{count === 0 ? 'Aucune annonce' : count === 1 ? '1 annonce' : `${count.toLocaleString('fr-FR')} annonces`}</p> : null}
          <SaveSearchButton
            query={{ ...filters, ...base, country: ctx.country.code }}
            name={[heading(ctx.country, ctx.category, ctx.city, q), describeFilters(filters, form)].filter(Boolean).join(' · ')}
          />
        </div>
        <FiltersForm action={listHref} sp={sp} form={form} open={hasFilters(filters)} districts={districts} handDelivery={!['emploi', 'services', 'immobilier'].includes(root?.slug ?? '')} wallets={root?.slug === 'emploi' ? [] : ctx.country.wallets ?? []} />
      </section>

      {items.length ? (
        <ListingList items={items} />
      ) : (
        <div className="section stack">
          <h2>Aucune annonce pour ces critères</h2>
          <p className="muted">Essayez un autre mot, une autre catégorie ou tout le pays.</p>
          <p><Link href={`/${p}`} className="btn btn-secondary">Voir toutes les annonces</Link></p>
        </div>
      )}

      {nextHref ? (
        <p className="section" style={{ textAlign: 'center' }}>
          <Link href={nextHref} className="btn btn-secondary" rel="next">{byPrice ? 'Annonces suivantes' : 'Annonces plus anciennes'}</Link>
        </p>
      ) : null}
    </div>
  );
}
