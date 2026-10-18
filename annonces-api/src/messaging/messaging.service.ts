import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { pgErrorText } from '../common/pg-error';
import { RateLimitService } from '../common/rate-limit.service';
import { Database, DB, Tx } from '../db/db.module';
import { ConversationRow, conversations, listings, MessageKind, messages, offers, reports, userBlocks, users } from '../db/schema';
import { ListingsService } from '../listings/listings.service';
import { scanMessage } from './message-rules';
import { ConversationQuery, ReportConversationInput } from './messaging.schemas';

const DAY_MS = 86_400_000;
export const OFFER_TTL_HOURS = 48;
/** Statut d'une offre à l'instant présent : une offre en attente depuis plus de 48 h a expiré. */
export const OFFER_STATUS = sql<string>`case when ${offers.status} = 'pending' and ${offers.createdAt} < now() - make_interval(hours => ${OFFER_TTL_HOURS}) then 'expired' else ${offers.status} end`;
const PAGE = 50;

@Injectable()
export class MessagingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rateLimit: RateLimitService,
    private readonly listingsService: ListingsService,
  ) {}

  // ------------------------------------------------------------------ garde-fous communs
  private async activeUser(userId: string) {
    const [u] = await this.db
      .select({ status: users.status, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u || u.status !== 'active') {
      throw new ForbiddenException({ code: 'USER_NOT_ACTIVE', message: 'Votre compte ne permet pas d’envoyer de messages.' });
    }
    return { isNew: Date.now() - u.createdAt.getTime() < DAY_MS };
  }

  private async assertNotBlocked(a: string, b: string) {
    const [row] = await this.db
      .select({ x: userBlocks.blockerId })
      .from(userBlocks)
      .where(or(and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)), and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a))))
      .limit(1);
    // Message volontairement neutre : on ne révèle pas qui a bloqué qui
    if (row) throw new ForbiddenException({ code: 'CANNOT_MESSAGE', message: 'Vous ne pouvez pas écrire à cet utilisateur.' });
  }

  private async participant(userId: string, conversationId: string) {
    const [c] = await this.db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (!c || (c.buyerId !== userId && c.sellerId !== userId)) {
      throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation introuvable.' });
    }
    const role = c.buyerId === userId ? 'buyer' : 'seller';
    return { c, role, otherId: role === 'buyer' ? c.sellerId : c.buyerId } as const;
  }

  /** Anti-spam : les comptes de moins de 24 h ont des limites plus basses. */
  private async limits(userId: string, isNew: boolean, kind: 'conversation' | 'message') {
    if (kind === 'conversation') await this.rateLimit.hit(`rl:conv:${userId}`, isNew ? 5 : 30, 86400);
    else await this.rateLimit.hit(`rl:msg:${userId}`, isNew ? 30 : 150, 3600);
  }

  /** Ajoute un message (texte, ou étape d'une offre de prix) et met à jour l'aperçu de la conversation. */
  async append(tx: Tx, c: ConversationRow, senderId: string, body: string, extra: { kind?: MessageKind; offerId?: string } = {}) {
    // Les messages d'offre sont écrits par l'application : pas d'analyse anti-arnaque
    const flags = extra.kind && extra.kind !== 'text' ? [] : scanMessage(body);
    const [m] = await tx.insert(messages).values({ conversationId: c.id, senderId, body, flags, kind: extra.kind ?? 'text', offerId: extra.offerId }).returning();
    const now = new Date();
    await tx
      .update(conversations)
      .set({
        lastMessageAt: now,
        lastMessagePreview: body.slice(0, 120),
        lastSenderId: senderId,
        ...(senderId === c.buyerId ? { buyerLastReadAt: now } : { sellerLastReadAt: now }),
      })
      .where(eq(conversations.id, c.id));
    return { id: m.id, senderId: m.senderId, body: m.body, flags: m.flags, kind: m.kind, offerId: m.offerId, createdAt: m.createdAt };
  }

  // ------------------------------------------------------------------ écrire
  /** Premier message à un vendeur. Si la conversation existe déjà, le message s'y ajoute. */
  async start(userId: string, listingId: string, body: string) {
    const c = await this.openWith(userId, listingId);
    const message = await this.db.transaction((tx) => this.append(tx, c, userId, body));
    return { conversationId: c.id, message };
  }

  /**
   * Ouvre (ou retrouve) la conversation de l'acheteur sur une annonce, avec tous les garde-fous :
   * compte actif, annonce en ligne, pas sa propre annonce, pas de blocage, anti-spam. Utilisé aussi par les offres.
   */
  async openWith(userId: string, listingId: string): Promise<ConversationRow> {
    const { isNew } = await this.activeUser(userId);

    const [l] = await this.db
      .select({ id: listings.id, sellerId: listings.userId, status: listings.status, sellerStatus: users.status })
      .from(listings)
      .innerJoin(users, eq(users.id, listings.userId))
      .where(eq(listings.id, listingId))
      .limit(1);
    if (!l || l.status !== 'active' || l.sellerStatus !== 'active') {
      throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Cette annonce n’est plus disponible.' });
    }
    if (l.sellerId === userId) {
      throw new ForbiddenException({ code: 'OWN_LISTING', message: 'C’est votre propre annonce.' });
    }
    await this.assertNotBlocked(userId, l.sellerId);

    const [existing] = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.listingId, listingId), eq(conversations.buyerId, userId)))
      .limit(1);
    await this.limits(userId, isNew, existing ? 'message' : 'conversation');

    await this.db
      .insert(conversations)
      .values({ listingId, buyerId: userId, sellerId: l.sellerId })
      .onConflictDoNothing({ target: [conversations.listingId, conversations.buyerId] });
    const [c] = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.listingId, listingId), eq(conversations.buyerId, userId)))
      .limit(1);
    return c;
  }

  async send(userId: string, conversationId: string, body: string) {
    const { isNew } = await this.activeUser(userId);
    const { c, otherId } = await this.participant(userId, conversationId);
    const [other] = await this.db.select({ status: users.status }).from(users).where(eq(users.id, otherId)).limit(1);
    if (!other || other.status === 'banned' || other.status === 'deleted') {
      throw new ForbiddenException({ code: 'RECIPIENT_INACTIVE', message: 'Ce compte n’est plus actif.' });
    }
    await this.assertNotBlocked(userId, otherId);
    await this.limits(userId, isNew, 'message');
    return this.db.transaction((tx) => this.append(tx, c, userId, body));
  }

  // ------------------------------------------------------------------ lire
  async inbox(userId: string, cursor?: string) {
    const cur = cursor ? decodeCursor(cursor) : null;
    const rows = await this.db
      .select({ c: conversations, cursorTs: sql<string>`${conversations.lastMessageAt}::text` })
      .from(conversations)
      .where(
        and(
          or(eq(conversations.buyerId, userId), eq(conversations.sellerId, userId)),
          cur ? sql`(${conversations.lastMessageAt}, ${conversations.id}) < (${cur.t}::timestamptz, ${cur.i}::uuid)` : undefined,
        ),
      )
      .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
      .limit(31);

    const hasMore = rows.length > 30;
    const page = rows.slice(0, 30);
    const otherIds: string[] = [...new Set(page.map(({ c }) => (c.buyerId === userId ? c.sellerId : c.buyerId)))];
    const listingIds: string[] = [...new Set(page.map(({ c }) => c.listingId))];

    type OtherRow = { id: string; displayName: string; verificationLevel: 'phone' | 'identity'; status: string };
    type ListingRowLite = { id: string; title: string; status: string };
    const others: OtherRow[] = otherIds.length
      ? await this.db
          .select({ id: users.id, displayName: users.displayName, verificationLevel: users.verificationLevel, status: users.status })
          .from(users)
          .where(inArray(users.id, otherIds))
      : [];
    const ls: ListingRowLite[] = listingIds.length
      ? await this.db.select({ id: listings.id, title: listings.title, status: listings.status }).from(listings).where(inArray(listings.id, listingIds))
      : [];
    const thumbs = await this.listingsService.thumbnails(listingIds);
    const otherMap = new Map(others.map((o) => [o.id, o]));
    const listingMap = new Map(ls.map((l) => [l.id, l]));

    const last = page[page.length - 1];
    return {
      items: page.map(({ c }) => {
        const mine = c.buyerId === userId ? c.buyerLastReadAt : c.sellerLastReadAt;
        const other = otherMap.get(c.buyerId === userId ? c.sellerId : c.buyerId);
        const l = listingMap.get(c.listingId);
        return {
          id: c.id,
          role: c.buyerId === userId ? 'buyer' : 'seller',
          listing: { id: c.listingId, title: l?.title ?? '', status: l?.status ?? 'removed', thumbnailUrl: thumbs.get(c.listingId) ?? null },
          other: other ?? null,
          lastMessagePreview: c.lastMessagePreview,
          lastMessageAt: c.lastMessageAt,
          lastFromMe: c.lastSenderId === userId,
          unread: c.lastSenderId !== userId && (!mine || c.lastMessageAt > mine),
        };
      }),
      nextCursor: hasMore && last ? encodeCursor(last.cursorTs, last.c.id) : null,
    };
  }

  /** Nombre de conversations non lues, pour la pastille de l'onglet Messages (requête légère). */
  async unreadCount(userId: string) {
    const [r] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(conversations)
      .where(
        and(
          sql`${conversations.lastSenderId} is distinct from ${userId}::uuid`,
          or(
            and(eq(conversations.buyerId, userId), sql`(${conversations.buyerLastReadAt} is null or ${conversations.lastMessageAt} > ${conversations.buyerLastReadAt})`),
            and(eq(conversations.sellerId, userId), sql`(${conversations.sellerLastReadAt} is null or ${conversations.lastMessageAt} > ${conversations.sellerLastReadAt})`),
          ),
        ),
      );
    return { count: Number(r?.n ?? 0) };
  }

  /**
   * Ouvre une conversation : derniers messages, ou seulement les nouveaux (`after`, relevé régulier),
   * ou les plus anciens (`before`). Marque la conversation comme lue.
   */
  async open(userId: string, conversationId: string, q: ConversationQuery) {
    const { c, role, otherId } = await this.participant(userId, conversationId);

    let rows: (typeof messages.$inferSelect)[];
    let hasOlder = false;
    if (q.after) {
      rows = await this.db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, c.id), gt(messages.id, q.after)))
        .orderBy(asc(messages.id))
        .limit(100);
    } else {
      const newestFirst = await this.db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, c.id), q.before ? lt(messages.id, q.before) : undefined))
        .orderBy(desc(messages.id))
        .limit(PAGE + 1);
      hasOlder = newestFirst.length > PAGE;
      rows = newestFirst.slice(0, PAGE).reverse();
    }

    await this.db
      .update(conversations)
      .set(role === 'buyer' ? { buyerLastReadAt: new Date() } : { sellerLastReadAt: new Date() })
      .where(eq(conversations.id, c.id));

    // Les métadonnées ne sont renvoyées qu'au premier chargement (le relevé régulier reste minuscule)
    let meta = null;
    if (!q.after && !q.before) {
      const [[other], [l], thumbs, [blocked]] = await Promise.all([
        this.db.select({ id: users.id, displayName: users.displayName, verificationLevel: users.verificationLevel, status: users.status }).from(users).where(eq(users.id, otherId)).limit(1),
        this.db
          .select({
            id: listings.id,
            title: listings.title,
            status: listings.status,
            priceType: listings.priceType,
            priceXaf: listings.priceXaf,
            adType: listings.adType,
            // Catégorie principale : conseils de sécurité adaptés (« emploi » : pas d'argent demandé au candidat)
            parentSlug: sql<string | null>`(select p.slug from categories c join categories p on p.id = c.parent_id where c.id = listings.category_id)`,
          })
          .from(listings).where(eq(listings.id, c.listingId)).limit(1),
        this.listingsService.thumbnails([c.listingId]),
        this.db.select({ x: userBlocks.blockerId }).from(userBlocks).where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, otherId))).limit(1),
      ]);
      meta = {
        id: c.id,
        role,
        listing: l ? { ...l, thumbnailUrl: thumbs.get(l.id) ?? null } : null,
        other: other ?? null,
        iBlocked: !!blocked,
      };
    }

    return {
      conversation: meta,
      // Pour afficher « Vu » sous mes derniers messages
      otherLastReadAt: role === 'buyer' ? c.sellerLastReadAt : c.buyerLastReadAt,
      messages: await this.withOffers(rows),
      hasOlder,
    };
  }

  /** Joint à chaque message d'offre l'offre elle-même, statut à jour (une offre en attente de plus de 48 h a expiré). */
  private async withOffers(rows: (typeof messages.$inferSelect)[]) {
    const ids = [...new Set(rows.map((m) => m.offerId).filter((x): x is string => !!x))];
    const found = ids.length
      ? await this.db
          .select({ id: offers.id, amountXaf: offers.amountXaf, status: OFFER_STATUS })
          .from(offers)
          .where(inArray(offers.id, ids))
      : [];
    const byId = new Map(found.map((o) => [o.id, o]));
    return rows.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      flags: m.flags,
      kind: m.kind,
      offer: m.offerId ? (byId.get(m.offerId) ?? null) : null,
      createdAt: m.createdAt,
    }));
  }

  async withListing(userId: string, listingId: string) {
    const [c] = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.listingId, listingId), eq(conversations.buyerId, userId)))
      .limit(1);
    if (!c) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Pas encore de conversation.' });
    return c;
  }

  // ------------------------------------------------------------------ protection
  /** Signaler l'autre personne : rend la conversation lisible par les modérateurs. */
  async report(userId: string, conversationId: string, input: ReportConversationInput) {
    const { c, otherId } = await this.participant(userId, conversationId);
    await this.rateLimit.hit(`rl:report:${userId}`, 20, 86400);
    try {
      await this.db.insert(reports).values({
        reporterId: userId,
        reportedUserId: otherId,
        conversationId: c.id,
        reason: input.reason,
        details: input.details ?? null,
      });
    } catch (err) {
      if (pgErrorText(err).includes('ux_reports_open')) {
        throw new ConflictException({ code: 'ALREADY_REPORTED', message: 'Vous avez déjà signalé cette personne. Le signalement est en cours d’examen.' });
      }
      throw err;
    }
    return { message: 'Merci. Notre équipe va examiner cette conversation.' };
  }

  async block(userId: string, targetId: string) {
    if (userId === targetId) throw new ForbiddenException({ code: 'SELF_BLOCK', message: 'Action impossible.' });
    await this.db.insert(userBlocks).values({ blockerId: userId, blockedId: targetId }).onConflictDoNothing();
    return { blocked: true };
  }

  async unblock(userId: string, targetId: string) {
    await this.db.delete(userBlocks).where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, targetId)));
    return { blocked: false };
  }

  // ------------------------------------------------------------------ modération
  /** Lecture réservée aux conversations ayant fait l'objet d'un signalement. */
  async forModeration(conversationId: string) {
    const [reported] = await this.db
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.conversationId, conversationId))
      .limit(1);
    if (!reported) {
      throw new ForbiddenException({ code: 'NOT_REPORTED', message: 'Seules les conversations signalées peuvent être consultées.' });
    }
    const [c] = await this.db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (!c) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation introuvable.' });

    const [people, [l], msgs] = await Promise.all([
      this.db.select({ id: users.id, displayName: users.displayName, phone: users.phoneE164, status: users.status, trustScore: users.trustScore })
        .from(users).where(inArray(users.id, [c.buyerId, c.sellerId])),
      this.db.select({ id: listings.id, title: listings.title, status: listings.status }).from(listings).where(eq(listings.id, c.listingId)).limit(1),
      this.db.select().from(messages).where(eq(messages.conversationId, c.id)).orderBy(asc(messages.id)).limit(1000),
    ]);
    return {
      id: c.id,
      listing: l ?? null,
      buyer: people.find((p) => p.id === c.buyerId) ?? null,
      seller: people.find((p) => p.id === c.sellerId) ?? null,
      messages: await this.withOffers(msgs),
    };
  }
}
