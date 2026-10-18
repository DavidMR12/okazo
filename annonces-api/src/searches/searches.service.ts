import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { RateLimitService } from '../common/rate-limit.service';
import { Database, DB } from '../db/db.module';
import { savedSearches } from '../db/schema';
import { listQuerySchema } from '../listings/listings.schemas';
import { ListingsService } from '../listings/listings.service';

const MAX_SEARCHES = 20;
// Ce qui décrit la page de résultats, pas la recherche : jamais enregistré
const NOT_SAVED = ['cursor', 'limit', 'sellerId'];

/**
 * Recherches sauvegardées : les filtres tels qu'envoyés à GET /listings, et pour chacune le nombre
 * d'annonces publiées depuis la dernière consultation (préparé pour les alertes par notification).
 */
@Injectable()
export class SearchesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rateLimit: RateLimitService,
    private readonly listings: ListingsService,
  ) {}

  /** Filtres validés exactement comme une recherche, puis nettoyés de la pagination. */
  private normalize(query: Record<string, unknown>): Record<string, string | number> {
    const result = listQuerySchema.safeParse(
      Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])),
    );
    if (!result.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Filtres de recherche invalides.' });
    const parsed = result.data as Record<string, unknown>;
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (NOT_SAVED.includes(k) || v === undefined) continue;
      if (k === 'sort' && v === 'recent') continue; // valeur par défaut
      if (k === 'limit') continue;
      out[k] = typeof v === 'number' ? v : String(v);
    }
    return out;
  }

  async create(userId: string, name: string, query: Record<string, unknown>) {
    await this.rateLimit.hit(`rl:search:${userId}`, 60, 3600);
    const clean = this.normalize(query);
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(savedSearches).where(eq(savedSearches.userId, userId));
    if (Number(n) >= MAX_SEARCHES) {
      throw new ConflictException({ code: 'SEARCHES_LIMIT', message: `Maximum ${MAX_SEARCHES} recherches sauvegardées. Supprimez-en une.` });
    }
    const [row] = await this.db.insert(savedSearches).values({ userId, name, query: clean }).returning();
    return { id: row.id, name: row.name, query: row.query, newCount: 0, createdAt: row.createdAt };
  }

  /** Mes recherches, avec le nombre de nouvelles annonces de chacune (publiées depuis la dernière consultation). */
  async list(userId: string) {
    const rows = await this.db.select().from(savedSearches).where(eq(savedSearches.userId, userId)).orderBy(asc(savedSearches.createdAt));
    const items = [];
    for (const r of rows) {
      // Filtres revalidés : une recherche ancienne ne doit jamais faire échouer la liste
      const parsed = listQuerySchema.safeParse(Object.fromEntries(Object.entries(r.query).map(([k, v]) => [k, String(v)])));
      const newCount = parsed.success ? await this.listings.count(parsed.data, r.lastSeenAt) : 0;
      items.push({ id: r.id, name: r.name, query: r.query, newCount, lastSeenAt: r.lastSeenAt, createdAt: r.createdAt });
    }
    return { items };
  }

  /** Consultation des résultats : les nouveautés repartent de zéro. */
  async markSeen(userId: string, id: string) {
    const rows = await this.db
      .update(savedSearches)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)))
      .returning({ id: savedSearches.id });
    if (!rows.length) throw new NotFoundException({ code: 'SEARCH_NOT_FOUND', message: 'Recherche introuvable.' });
    return { id, newCount: 0 };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
  }
}
