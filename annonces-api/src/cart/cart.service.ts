import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { priceUnit } from '../categories/category-forms';
import { CategoriesService } from '../categories/categories.service';
import { RateLimitService } from '../common/rate-limit.service';
import { Database, DB } from '../db/db.module';
import { cartItems, cities, listings, users } from '../db/schema';
import { ListingsService } from '../listings/listings.service';

const CART_MAX = 50;

/**
 * Panier : liste d'achats regroupée par vendeur. Aucun paiement ne passe par l'application :
 * depuis le panier, l'acheteur contacte chaque vendeur (messagerie, WhatsApp) et conclut avec lui.
 */
@Injectable()
export class CartService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rateLimit: RateLimitService,
    private readonly listings: ListingsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  /** Idempotent : ajouter deux fois la même annonce ne fait rien de plus. */
  async add(userId: string, listingId: string) {
    await this.rateLimit.hit(`rl:cart:${userId}`, 200, 3600);

    const [l] = await this.db
      .select({
        userId: listings.userId,
        status: listings.status,
        adType: listings.adType,
        // Requête avec jointure : Drizzle qualifie la colonne ("listings"."category_id")
        parentSlug: sql<string | null>`(select p.slug from categories c join categories p on p.id = c.parent_id where c.id = ${listings.categoryId})`,
      })
      .from(listings)
      .innerJoin(users, eq(users.id, listings.userId))
      .where(and(eq(listings.id, listingId), eq(users.status, 'active')))
      .limit(1);
    if (!l || l.status !== 'active') throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' });
    if (l.userId === userId) throw new BadRequestException({ code: 'OWN_LISTING', message: 'Impossible d’ajouter votre propre annonce.' });
    // On n'achète ni une demande (« Je recherche ») ni une offre d'emploi
    if (l.adType !== 'offer' || l.parentSlug === 'emploi') {
      throw new BadRequestException({ code: 'NOT_PURCHASABLE', message: 'Cette annonce ne peut pas être ajoutée au panier.' });
    }

    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(cartItems).where(eq(cartItems.userId, userId));
    if (Number(n) >= CART_MAX) {
      throw new ConflictException({ code: 'CART_LIMIT', message: `Maximum ${CART_MAX} articles dans le panier. Retirez-en quelques-uns.` });
    }

    await this.db.insert(cartItems).values({ userId, listingId }).onConflictDoNothing();
    return { listingId, inCart: true };
  }

  async remove(userId: string, listingId: string): Promise<void> {
    await this.rateLimit.hit(`rl:cart:${userId}`, 200, 3600);
    await this.db.delete(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.listingId, listingId)));
  }

  /** Identifiants seuls : pastille de l'onglet et boutons « Ajouter au panier » sans requête supplémentaire. */
  async ids(userId: string) {
    const rows = await this.db.select({ id: cartItems.listingId }).from(cartItems).where(eq(cartItems.userId, userId)).limit(CART_MAX);
    return { ids: rows.map((r) => r.id) };
  }

  /** Panier complet, regroupé par vendeur, avec le total des articles encore disponibles. */
  async list(userId: string) {
    const rows = await this.db
      .select({
        id: listings.id,
        title: listings.title,
        priceType: listings.priceType,
        priceXaf: listings.priceXaf,
        categoryId: listings.categoryId,
        attributes: listings.attributes,
        status: listings.status,
        expiresAt: listings.expiresAt,
        city: cities.name,
        sellerId: users.id,
        sellerName: users.displayName,
        sellerLevel: users.verificationLevel,
        sellerStatus: users.status,
        sellerContact: users.contactPreference,
      })
      .from(cartItems)
      .innerJoin(listings, eq(listings.id, cartItems.listingId))
      .innerJoin(users, eq(users.id, listings.userId))
      .innerJoin(cities, eq(cities.id, listings.cityId))
      .where(and(eq(cartItems.userId, userId), ne(listings.status, 'removed'))) // annonces retirées (fraude) : masquées
      .orderBy(asc(cartItems.createdAt));

    const thumbs = await this.listings.thumbnails(rows.map((r) => r.id));
    const now = new Date();
    const groups = new Map<string, { seller: object; items: object[]; total: number }>();
    for (const r of rows) {
      const available = r.status === 'active' && !!r.expiresAt && r.expiresAt > now && r.sellerStatus === 'active';
      const form = await this.categoriesService.formFor(r.categoryId);
      let g = groups.get(r.sellerId);
      if (!g) {
        g = {
          seller: { id: r.sellerId, displayName: r.sellerName, verificationLevel: r.sellerLevel, contactPreference: r.sellerContact },
          items: [],
          total: 0,
        };
        groups.set(r.sellerId, g);
      }
      g.items.push({
        id: r.id,
        title: r.title,
        priceType: r.priceType,
        priceXaf: r.priceXaf,
        priceUnit: priceUnit(form, r.attributes),
        city: r.city,
        available, // vendue, expirée ou vendeur suspendu : affichée grisée
        thumbnailUrl: thumbs.get(r.id) ?? null,
      });
      if (available && r.priceXaf && (r.priceType === 'fixed' || r.priceType === 'negotiable')) g.total += r.priceXaf;
    }
    const sellers = [...groups.values()];
    return { sellers, count: rows.length, total: sellers.reduce((s, g) => s + g.total, 0) };
  }
}
