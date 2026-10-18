import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { RateLimitService } from '../common/rate-limit.service';
import { Database, DB } from '../db/db.module';
import { conversations, listings, messages, reports, reviews, userBlocks, users } from '../db/schema';
import { scanMessage } from '../messaging/message-rules';
import { CreateReviewInput, ReportReviewInput } from './reviews.schemas';

/** Délai minimal après le début de l'échange : un avis ne se donne pas dans la minute (faux avis, coups de colère). */
export const REVIEW_MIN_AGE_HOURS = 24;
const PAGE = 20;
const PHONE_RE = /(?:\+?\d[\s.-]?){8,}/;

type Ineligible = { code: string; message: string };

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rateLimit: RateLimitService,
  ) {}

  /**
   * Peut-on donner un avis dans cette conversation ? Il faut un vrai échange : les deux personnes ont écrit,
   * et l'échange a commencé il y a au moins 24 h (ou l'annonce est marquée vendue). Un avis par personne et par conversation.
   */
  private async context(userId: string, conversationId: string) {
    const [c] = await this.db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (!c || (c.buyerId !== userId && c.sellerId !== userId)) {
      throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation introuvable.' });
    }
    const role = c.buyerId === userId ? ('buyer' as const) : ('seller' as const);
    const targetId = role === 'buyer' ? c.sellerId : c.buyerId;

    const [[target], [listing], senders, [mine], [blocked]] = await Promise.all([
      this.db.select({ id: users.id, displayName: users.displayName, status: users.status }).from(users).where(eq(users.id, targetId)).limit(1),
      this.db.select({ status: listings.status, parentSlug: sql<string | null>`(select p.slug from categories c join categories p on p.id = c.parent_id where c.id = ${listings.categoryId})` }).from(listings).where(eq(listings.id, c.listingId)).limit(1),
      this.db
        .select({ senderId: messages.senderId, first: sql<string>`min(${messages.createdAt})::text` })
        .from(messages)
        .where(eq(messages.conversationId, c.id))
        .groupBy(messages.senderId),
      this.db.select().from(reviews).where(and(eq(reviews.conversationId, c.id), eq(reviews.authorId, userId))).limit(1),
      this.db
        .select({ x: userBlocks.blockerId })
        .from(userBlocks)
        .where(or(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, targetId)), and(eq(userBlocks.blockerId, targetId), eq(userBlocks.blockedId, userId))))
        .limit(1),
    ]);

    let ineligible: Ineligible | null = null;
    const bothWrote = senders.some((s) => s.senderId === userId) && senders.some((s) => s.senderId === targetId);
    const firstAt = senders.length ? Math.min(...senders.map((s) => new Date(s.first).getTime())) : Date.now();
    const oldEnough = Date.now() - firstAt >= REVIEW_MIN_AGE_HOURS * 3_600_000 || listing?.status === 'sold';
    if (mine) ineligible = { code: 'ALREADY_REVIEWED', message: 'Vous avez déjà donné votre avis pour cet échange.' };
    else if (!target || target.status === 'deleted' || target.status === 'banned') ineligible = { code: 'TARGET_INACTIVE', message: 'Ce compte n’est plus actif.' };
    else if (blocked) ineligible = { code: 'CANNOT_REVIEW', message: 'Vous ne pouvez pas donner d’avis à cet utilisateur.' };
    else if (!bothWrote) ineligible = { code: 'NO_EXCHANGE', message: 'Vous pourrez donner votre avis quand vous aurez échangé tous les deux.' };
    else if (!oldEnough) ineligible = { code: 'TOO_EARLY', message: 'Vous pourrez donner votre avis 24 h après le début de l’échange, ou dès que l’annonce est marquée vendue.' };

    return { c, role, target, mine: mine ?? null, ineligible, parentSlug: listing?.parentSlug ?? null };
  }

  private publicReview(r: typeof reviews.$inferSelect) {
    return { id: r.id, rating: r.rating, comment: r.comment, authorRole: r.authorRole, createdAt: r.createdAt };
  }

  /** État de l'avis pour une conversation (affiché dans la messagerie). */
  async status(userId: string, conversationId: string) {
    const { role, target, mine, ineligible, parentSlug } = await this.context(userId, conversationId);
    return {
      canReview: !ineligible,
      parentSlug,
      reason: ineligible && ineligible.code !== 'ALREADY_REVIEWED' ? ineligible : null,
      role,
      target: target ? { id: target.id, displayName: target.displayName } : null,
      mine: mine ? this.publicReview(mine) : null,
    };
  }

  async create(userId: string, conversationId: string, input: CreateReviewInput) {
    const { c, role, target, ineligible } = await this.context(userId, conversationId);
    if (ineligible) {
      const Ex = ineligible.code === 'ALREADY_REVIEWED' ? ConflictException : ForbiddenException;
      throw new Ex(ineligible);
    }
    // Un avis parle de l'échange, pas d'un contact : ni numéro, ni lien
    if (input.comment && (PHONE_RE.test(input.comment) || scanMessage(input.comment).includes('link'))) {
      throw new BadRequestException({ code: 'REVIEW_CONTENT', message: 'Pas de numéro de téléphone ni de lien dans un avis.' });
    }
    await this.rateLimit.hit(`rl:review:${userId}`, 20, 86400);

    const [row] = await this.db
      .insert(reviews)
      .values({ conversationId: c.id, listingId: c.listingId, authorId: userId, targetId: target!.id, authorRole: role, rating: input.rating, comment: input.comment ?? null })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'Vous avez déjà donné votre avis pour cet échange.' });
    return this.publicReview(row);
  }

  /** Avis publics reçus par un utilisateur : résumé (moyenne, répartition) et liste paginée. */
  async forUser(userId: string, cursor?: string) {
    const [u] = await this.db
      .select({ ratingAvg: users.ratingAvg, ratingCount: users.ratingCount, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u || u.status !== 'active') throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });

    const published = and(eq(reviews.targetId, userId), eq(reviews.status, 'published'));
    const c = cursor ? decodeCursor(cursor) : null;
    const rows = await this.db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        authorRole: reviews.authorRole,
        createdAt: reviews.createdAt,
        ts: sql<string>`${reviews.createdAt}::text`,
        authorName: users.displayName,
        listingTitle: listings.title,
        // Catégorie principale de l'annonce : « emploi » → Recruteur / Candidat au lieu de Vendeur / Acheteur
        listingParentSlug: sql<string | null>`(select p.slug from categories c join categories p on p.id = c.parent_id where c.id = ${listings.categoryId})`,
      })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.authorId))
      .innerJoin(listings, eq(listings.id, reviews.listingId))
      .where(c ? and(published, or(lt(reviews.createdAt, sql`${c.t}::timestamptz`), and(eq(sql`${reviews.createdAt}`, sql`${c.t}::timestamptz`), lt(reviews.id, c.i)))) : published)
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(PAGE + 1);

    const page = rows.slice(0, PAGE);
    let distribution: Record<string, number> | undefined;
    if (!cursor) {
      const d = await this.db
        .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
        .from(reviews)
        .where(published)
        .groupBy(reviews.rating);
      distribution = Object.fromEntries([5, 4, 3, 2, 1].map((r) => [String(r), d.find((x) => x.rating === r)?.n ?? 0]));
    }
    return {
      summary: { average: u.ratingAvg, count: u.ratingCount, distribution },
      items: page.map(({ ts: _ts, ...r }) => r),
      nextCursor: rows.length > PAGE ? encodeCursor(page[page.length - 1].ts, page[page.length - 1].id) : null,
    };
  }

  /** Signaler un avis (faux avis, insulte…) : il passe en modération, sans être masqué d'office. */
  async report(userId: string, reviewId: string, input: ReportReviewInput) {
    const [r] = await this.db.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
    if (!r || r.status !== 'published') throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Avis introuvable.' });
    if (r.authorId === userId) throw new BadRequestException({ code: 'OWN_REVIEW', message: 'C’est votre propre avis.' });
    await this.rateLimit.hit(`rl:report:${userId}`, 20, 86400);
    const [dup] = await this.db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.reviewId, reviewId), eq(reports.reporterId, userId), inArray(reports.status, ['open', 'reviewing'])))
      .limit(1);
    if (dup) return { id: dup.id, status: 'open' as const };
    const [row] = await this.db
      .insert(reports)
      .values({ reporterId: userId, reportedUserId: r.authorId, reviewId, reason: input.reason, details: input.details })
      .returning({ id: reports.id });
    return { id: row.id, status: 'open' as const };
  }
}
