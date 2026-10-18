import Link from 'next/link';
import { CategoryIcon } from '@/components/CategoryIcon';
import type { Category } from '@/lib/types';

/** Les 7 catégories de la grille, dans le même ordre que l'application ; les autres sont derrière « Autres ». */
export const HOME_GRID = ['vehicules', 'immobilier', 'electronique', 'maison', 'mode', 'services', 'emploi'];

/**
 * Grille d'icônes bleues des catégories, comme dans l'application : 7 catégories principales puis « Autres »
 * (page de toutes les catégories). Sur les pages de liste, « Toutes » en tête et la catégorie en cours en bleu plein
 * (« Autres » si elle n'est pas dans la grille).
 */
export function CategoryGrid({ categories, hrefFor, othersHref, currentId, showAll = false }: {
  categories: Category[];
  hrefFor: (slug?: string) => string;
  othersHref: string;
  currentId?: number;
  showAll?: boolean;
}) {
  const tiles = HOME_GRID.map((slug) => categories.find((c) => c.slug === slug)).filter((c): c is Category => !!c);
  const inOthers = !!currentId && !tiles.some((c) => c.id === currentId);
  return (
    <nav className="cat-grid" aria-label="Catégories">
      {showAll ? (
        <Link href={hrefFor()} className="cat-tile" aria-current={!currentId ? 'page' : undefined} prefetch={false}>
          <CategoryIcon slug="toutes" />
          <span>Toutes</span>
        </Link>
      ) : null}
      {tiles.map((c) => (
        <Link key={c.id} href={hrefFor(c.slug)} className="cat-tile" aria-current={currentId === c.id ? 'page' : undefined} prefetch={false}>
          <CategoryIcon slug={c.slug} />
          <span>{c.name.replace(/ et .*$/, '')}</span>
        </Link>
      ))}
      <Link href={othersHref} className="cat-tile" aria-current={inOthers ? 'page' : undefined} prefetch={false}>
        <CategoryIcon slug="autres" />
        <span>Autres</span>
      </Link>
    </nav>
  );
}
