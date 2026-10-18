import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, lt, sql } from 'drizzle-orm';
import { pgErrorText } from '../common/pg-error';
import { RateLimitService } from '../common/rate-limit.service';
import { Database, DB } from '../db/db.module';
import { categories, conversations, listings, offers, users } from '../db/schema';
import { MessagingService, OFFER_STATUS, OFFER_TTL_HOURS } from '../messaging/messaging.service';

/** Offre la plus basse acceptée : 30 % du prix affiché (évite les offres moqueuses qui découragent les vendeurs). */
export const OFFER_MIN_RATIO = 0.3;
const DAILY_LIMIT = 20;
const xaf = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

@Injectable()
export class OffersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rateLimit: RateLimitService,
    private readonly messaging: MessagingService,
  ) {}

  /** Les offres en attente depuis plus de 48 h passent « expirées » (et libèrent la place pour une nouvelle offre). */
  private expireStale(conversationId: string) {
    return this.db
      .update(offers)
      .set({ status: 'expired' })
      .where(and(eq(offers.conversationId, conversationId), eq(offers.status, 'pending'), lt(offers.createdAt, sql`now() - make_interval(hours => ${OFFER_TTL_HOURS})`)));
  }

  /**
   * L'acheteur propose un prix. Possible sur une offre « Je propose » en ligne, avec un prix (pas gratuite),
   * hors Emploi. Montant inférieur au prix affiché, et au moins 30 % de ce prix.
   */
  async make(userId: string, listingId: string, amountXaf: number, message?: string) {
    const [l] = await this.db
      .select({
        status: listings.status,
        adType: listings.adType,
        priceType: listings.priceType,
        priceXaf: listings.priceXaf,
        parentSlug: sql<string | null>`(select p.slug from categories p where p.id = ${categories.parentId})`,
      })
      .from(listings)
      .innerJoin(categories, eq(categories.id, listings.categoryId))
      .where(eq(listings.id, listingId))
      .limit(1);
    if (!l || l.status !== 'active') throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Cette annonce n’est plus disponible.' });
    if (l.adType !== 'offer' || l.parentSlug === 'emploi' || l.priceType === 'free') {
      throw new BadRequestException({ code: 'OFFER_NOT_ALLOWED', message: 'On ne peut pas faire d’offre sur cette annonce.' });
    }
    const price = l.priceType === 'fixed' || l.priceType === 'negotiable' ? l.priceXaf : null;
    if (price !== null && amountXaf >= price) {
      throw new BadRequestException({ code: 'OFFER_TOO_HIGH', message: `Proposez un montant inférieur au prix affiché (${xaf(price)}).` });
    }
    if (price !== null && amountXaf < Math.ceil(price * OFFER_MIN_RATIO)) {
      throw new BadRequestException({ code: 'OFFER_TOO_LOW', message: `Offre trop basse : proposez au moins ${xaf(Math.ceil(price * OFFER_MIN_RATIO))}.` });
    }

    // Garde-fous de la messagerie (compte actif, pas sa propre annonce, blocage, anti-spam) et conversation
    const c = await this.messaging.openWith(userId, listingId);
    await this.expireStale(c.id);
    const [pending] = await this.db.select({ id: offers.id }).from(offers).where(and(eq(offers.conversationId, c.id), eq(offers.status, 'pending'))).limit(1);
    if (pending) throw new ConflictException({ code: 'OFFER_PENDING', message: 'Vous avez déjà une offre en attente : attendez la réponse du vendeur ou retirez-la.' });
    await this.rateLimit.hit(`rl:offer:${userId}`, DAILY_LIMIT, 86400);

    try {
      return await this.db.transaction(async (tx) => {
        const [o] = await tx.insert(offers).values({ conversationId: c.id, listingId, buyerId: userId, sellerId: c.sellerId, amountXaf }).returning();
        if (message) await this.messaging.append(tx, c, userId, message);
        const m = await this.messaging.append(tx, c, userId, `Offre : ${xaf(amountXaf)}`, { kind: 'offer', offerId: o.id });
        return { offerId: o.id, conversationId: c.id, messageId: m.id, status: 'pending' as const };
      });
    } catch (e) {
      // Deux offres envoyées en même temps : l'index unique n'en garde qu'une
      if (pgErrorText(e).includes('uq_offers_pending')) {
        throw new ConflictException({ code: 'OFFER_PENDING', message: 'Vous avez déjà une offre en attente.' });
      }
      throw e;
    }
  }

  /** Réponse du vendeur (accepter, refuser) ou retrait par l'acheteur : l'étape s'inscrit dans la conversation. */
  async respond(userId: string, offerId: string, action: 'accept' | 'decline' | 'withdraw') {
    const [o] = await this.db.select({ offer: offers, status: OFFER_STATUS }).from(offers).where(eq(offers.id, offerId)).limit(1);
    const allowed = o && (action === 'withdraw' ? o.offer.buyerId === userId : o.offer.sellerId === userId);
    if (!o || !allowed) throw new NotFoundException({ code: 'OFFER_NOT_FOUND', message: 'Offre introuvable.' });
    if (o.status !== 'pending') {
      throw new ConflictException({
        code: 'OFFER_CLOSED',
        message: o.status === 'expired' ? 'Cette offre a expiré (48 h sans réponse).' : 'Cette offre a déjà reçu une réponse.',
      });
    }
    if (action === 'accept') {
      const [l] = await this.db.select({ status: listings.status }).from(listings).where(eq(listings.id, o.offer.listingId)).limit(1);
      if (l?.status !== 'active') throw new ConflictException({ code: 'LISTING_NOT_ACTIVE', message: 'L’annonce n’est plus en ligne.' });
    }
    const [other] = await this.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, action === 'withdraw' ? o.offer.sellerId : o.offer.buyerId))
      .limit(1);
    if (!other || other.status === 'banned' || other.status === 'deleted') {
      throw new ForbiddenException({ code: 'RECIPIENT_INACTIVE', message: 'Ce compte n’est plus actif.' });
    }

    const status = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'withdrawn';
    const kind = action === 'accept' ? 'offer_accepted' : action === 'decline' ? 'offer_declined' : 'offer_withdrawn';
    const verb = action === 'accept' ? 'acceptée' : action === 'decline' ? 'refusée' : 'retirée';

    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(offers)
        .set({ status, respondedAt: new Date() })
        .where(and(eq(offers.id, offerId), eq(offers.status, 'pending')))
        .returning({ id: offers.id });
      if (!updated.length) throw new ConflictException({ code: 'OFFER_CLOSED', message: 'Cette offre a déjà reçu une réponse.' });
      const [c] = await tx.select().from(conversations).where(eq(conversations.id, o.offer.conversationId)).limit(1);
      await this.messaging.append(tx, c, userId, `Offre de ${xaf(o.offer.amountXaf)} ${verb}.`, { kind, offerId });
      return { id: offerId, status };
    });
  }
}
