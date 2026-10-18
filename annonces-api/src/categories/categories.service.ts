import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { categories } from '../db/schema';
import { CategoryForm, mergeForms } from './category-forms';

type Row = typeof categories.$inferSelect;

/**
 * Catégories et leurs formulaires, gardés en mémoire 60 s : elles changent rarement
 * et sont lues à chaque publication, modification et affichage d'annonce.
 */
@Injectable()
export class CategoriesService {
  private cache: { rows: Row[]; forms: Map<number, CategoryForm>; at: number } | null = null;

  constructor(@Inject(DB) private readonly db: Database) {}

  private async load() {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache;
    const rows = await this.db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const forms = new Map<number, CategoryForm>();
    for (const r of rows) {
      const parent = r.parentId ? byId.get(r.parentId) : undefined;
      forms.set(r.id, mergeForms(parent?.attributesSchema, r.attributesSchema));
    }
    this.cache = { rows, forms, at: Date.now() };
    return this.cache;
  }

  /** Formulaire effectif (catégorie principale + sous-catégorie). Catégorie inconnue : formulaire par défaut. */
  async formFor(categoryId: number): Promise<CategoryForm> {
    return (await this.load()).forms.get(categoryId) ?? mergeForms(null, null);
  }

  /** Arbre envoyé à l'application et au site : chaque catégorie avec son formulaire (filtres compris). */
  async tree() {
    const { rows, forms } = await this.load();
    const view = (c: Row) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      requiresVerification: c.requiresVerification,
      form: forms.get(c.id)!,
    });
    return rows
      .filter((c) => c.parentId === null)
      .map((root) => ({ ...view(root), children: rows.filter((c) => c.parentId === root.id).map(view) }));
  }
}
