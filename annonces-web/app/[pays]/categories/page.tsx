import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CategoryIcon } from '@/components/CategoryIcon';
import { getCategories, getCountries } from '@/lib/api';

export const revalidate = 3600;

type Params = Promise<{ pays: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { pays } = await params;
  const country = (await getCountries()).find((c) => c.code.toLowerCase() === pays.toLowerCase());
  return { title: country ? `Toutes les catégories : ${country.name}` : 'Toutes les catégories' };
}

/** « Autres » de la grille : toutes les catégories et leurs sous-catégories (comme l'écran de l'application). */
export default async function AllCategoriesPage({ params }: { params: Params }) {
  const { pays } = await params;
  const [countries, categories] = await Promise.all([getCountries(), getCategories()]);
  const country = countries.find((c) => c.code.toLowerCase() === pays.toLowerCase());
  if (!country) return notFound();
  const p = country.code.toLowerCase();

  return (
    <div className="container">
      <nav className="breadcrumb" aria-label="Fil d'Ariane">
        <ol>
          <li><Link href="/">Accueil</Link></li>
          <li><Link href={`/${p}`}>{country.name}</Link></li>
        </ol>
      </nav>
      <section className="section stack">
        <h1>Toutes les catégories</h1>
        <div className="all-cats">
          {categories.map((c) => (
            <section key={c.id} className="all-cat" aria-labelledby={`cat-${c.id}`}>
              <Link href={`/${p}/${c.slug}`} className="all-cat-head" id={`cat-${c.id}`}>
                <span className="all-cat-icon"><CategoryIcon slug={c.slug} size={22} /></span>
                {c.name}
              </Link>
              {c.children?.length ? (
                <ul>
                  {c.children.map((s) => (
                    <li key={s.id}><Link href={`/${p}/${s.slug}`}>{s.name}</Link></li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
