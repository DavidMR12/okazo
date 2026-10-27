import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { RateLimitService } from '../common/rate-limit.service';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import { cities, favorites, listings, users } from '../db/schema';
import { ListingsService } from '../listings/listings.service';

@Injectable()
export class FavoritesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rateLimit: RateLimitService,
    private readonly listings: ListingsService,
  ) {}

  /** Idempotent : ajouter deux fois la même annonce ne fait rien de plus. */
  async add(userId: string, listingId: string) {
    await this.rateLimit.hit(`rl:fav:${userId}`, 200, 3600);

    const [l] = await this.db
      .select({ userId: listings.userId, status: listings.status })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);
    if (!l || l.status !== 'active') throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' });
    if (l.userId === userId) throw new BadRequestException({ code: 'OWN_LISTING', message: 'Impossible d’ajouter votre propre annonce.' });

    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(favorites)
      .where(eq(favorites.userId, userId));
    if (Number(n) >= env.FAVORITES_MAX) {
      throw new ConflictException({ code: 'FAVORITES_LIMIT', message: `Maximum ${env.FAVORITES_MAX} favoris. Retirez-en quelques-uns.` });
    }

    await this.db.insert(favorites).values({ userId, listingId }).onConflictDoNothing();
    return { listingId, favorited: true };
  }

  async remove(userId: string, listingId: string): Promise<void> {
    await this.rateLimit.hit(`rl:fav:${userId}`, 200, 3600);
    await this.db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.listingId, listingId)));
  }

  /** Liste légère des identifiants, pour afficher les cœurs dans les listes sans requête supplémentaire. */
  async ids(userId: string) {
    const rows = await this.db
      .select({ id: favorites.listingId })
      .from(favorites)
      .where(eq(favorites.userId, userId))
      .limit(env.FAVORITES_MAX);
    return { ids: rows.map((r) => r.id) };
  }

  async list(userId: string, cursor: string | undefined, limit: number) {
    const c = cursor ? decodeCursor(cursor) : null;
    const rows = await this.db
      .select({
        id: listings.id,
        title: listings.title,
        priceType: listings.priceType,
        priceXaf: listings.priceXaf,
        status: listings.status,
        expiresAt: listings.expiresAt,
        sellerStatus: users.status,
        city: sql<string>`coalesce(${listings.cityOther}, ${cities.name})`,
        favoritedAt: favorites.createdAt,
        cursorTs: sql<string>`${favorites.createdAt}::text`,
      })
      .from(favorites)
      .innerJoin(listings, eq(listings.id, favorites.listingId))
      .innerJoin(users, eq(users.id, listings.userId))
      .innerJoin(cities, eq(cities.id, listings.cityId))
      .where(
        and(
          eq(favorites.userId, userId),
          ne(listings.status, 'removed'), // annonces retirées (fraude) : masquées
          c ? sql`(${favorites.createdAt}, ${favorites.listingId}) < (${c.t}::timestamptz, ${c.i}::uuid)` : undefined,
        ),
      )
      .orderBy(desc(favorites.createdAt), desc(favorites.listingId))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const thumbs = await this.listings.thumbnails(page.map((r) => r.id));
    const now = new Date();
    const last = page[page.length - 1];

    return {
      items: page.map((r) => ({
        id: r.id,
        title: r.title,
        priceType: r.priceType,
        priceXaf: r.priceXaf,
        city: r.city,
        status: r.status,
        // Vendue, expirée ou vendeur suspendu : affichée grisée côté client
        available: r.status === 'active' && !!r.expiresAt && r.expiresAt > now && r.sellerStatus === 'active',
        favoritedAt: r.favoritedAt,
        thumbnailUrl: thumbs.get(r.id) ?? null,
      })),
      nextCursor: hasMore && last ? encodeCursor(last.cursorTs, last.id) : null,
    };
  }
}
