import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { listingImages, listings, moderationActions, reports, users } from '../db/schema';
import { thumbKey } from '../media/media-keys';
import { StorageService } from '../media/storage.service';

interface QueueRow {
  listing_id: string;
  title: string;
  price_xaf: string | number | null;
  created_at: Date;
  seller_id: string;
  trust_score: number;
  verification_level: string;
  open_reports: string | number;
  rule_hits: unknown;
}

@Injectable()
export class ModerationAdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  /** File d'attente triée : règles déclenchées d'abord, puis vendeurs les moins fiables, puis les plus anciennes. */
  async queue(limit: number, offset: number) {
    const rows = (await this.db.execute(
      sql`select * from v_moderation_queue limit ${limit} offset ${offset}`,
    )) as unknown as QueueRow[];

    const ids = rows.map((r) => r.listing_id);
    const thumbs = new Map<string, string>();
    if (ids.length) {
      const imgs = await this.db
        .select({ listingId: listingImages.listingId, key: listingImages.storageKey })
        .from(listingImages)
        .where(and(inArray(listingImages.listingId, ids), eq(listingImages.position, 0)));
      // Photo pas encore traitée (dossier pending/) : pas d'aperçu
      imgs.filter((i) => i.key.startsWith('listings/')).forEach((i) => thumbs.set(i.listingId, this.storage.publicUrl(thumbKey(i.key))));
    }

    return {
      items: rows.map((r) => ({
        listingId: r.listing_id,
        title: r.title,
        priceXaf: r.price_xaf === null ? null : Number(r.price_xaf),
        createdAt: r.created_at,
        sellerId: r.seller_id,
        sellerTrustScore: r.trust_score,
        sellerVerification: r.verification_level,
        openReports: Number(r.open_reports),
        ruleHits: r.rule_hits,
        thumbnailUrl: thumbs.get(r.listing_id) ?? null,
      })),
    };
  }

  async detail(id: string) {
    const [row] = await this.db
      .select({ listing: listings, seller: users })
      .from(listings)
      .innerJoin(users, eq(users.id, listings.userId))
      .where(eq(listings.id, id))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' });

    const [images, history] = await Promise.all([
      this.db.select().from(listingImages).where(eq(listingImages.listingId, id)).orderBy(asc(listingImages.position)),
      this.db.select().from(moderationActions).where(eq(moderationActions.listingId, id)).orderBy(desc(moderationActions.createdAt)),
    ]);

    return {
      listing: row.listing,
      seller: {
        id: row.seller.id,
        phone: row.seller.phoneE164,
        displayName: row.seller.displayName,
        status: row.seller.status,
        verificationLevel: row.seller.verificationLevel,
        trustScore: row.seller.trustScore,
        memberSince: row.seller.createdAt,
      },
      images: images.map((i) => ({
        position: i.position,
        processed: i.sha256 !== null,
        url: i.storageKey.startsWith('listings/') ? this.storage.publicUrl(i.storageKey) : null,
      })),
      history,
    };
  }

  async approve(moderatorId: string, id: string, note?: string) {
    // Impossible d'approuver tant que les photos n'ont pas été traitées (elles seraient encore dans pending/)
    const unprocessed = await this.db
      .select({ id: listingImages.id })
      .from(listingImages)
      .where(and(eq(listingImages.listingId, id), sql`${listingImages.sha256} is null`))
      .limit(1);
    if (unprocessed.length) {
      throw new ConflictException({ code: 'IMAGES_NOT_READY', message: 'Les photos sont encore en cours de traitement.' });
    }

    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(listings)
        .set({ status: 'active', rejectionReason: null })
        .where(and(eq(listings.id, id), eq(listings.status, 'pending_review')))
        .returning({ userId: listings.userId });
      if (!updated) throw new ConflictException({ code: 'NOT_PENDING', message: "Cette annonce n'est pas en attente." });

      await tx.insert(moderationActions).values({ listingId: id, userId: updated.userId, moderatorId, action: 'approve', note });
      // Annonce jugée conforme : les signalements ouverts sont classés sans suite
      await tx
        .update(reports)
        .set({ status: 'dismissed', handledBy: moderatorId, handledAt: new Date(), resolutionNote: 'Annonce approuvée après revue.' })
        .where(and(eq(reports.listingId, id), inArray(reports.status, ['open', 'reviewing'])));
      await tx.update(users).set({ trustScore: sql`least(${users.trustScore} + 2, 100)` }).where(eq(users.id, updated.userId));
    });
    return { id, status: 'active' as const };
  }

  async reject(moderatorId: string, id: string, dto: { reasonCode: string; message?: string; note?: string }) {
    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(listings)
        .set({
          status: 'rejected',
          rejectionReason: dto.message ?? 'Votre annonce ne respecte pas nos règles de publication.',
        })
        .where(and(eq(listings.id, id), eq(listings.status, 'pending_review')))
        .returning({ userId: listings.userId });
      if (!updated) throw new ConflictException({ code: 'NOT_PENDING', message: "Cette annonce n'est pas en attente." });

      await tx.insert(moderationActions).values({
        listingId: id,
        userId: updated.userId,
        moderatorId,
        action: 'reject',
        reasonCode: dto.reasonCode,
        note: dto.note,
      });
      await tx
        .update(reports)
        .set({ status: 'resolved', handledBy: moderatorId, handledAt: new Date(), resolutionNote: 'Annonce refusée après revue.' })
        .where(and(eq(reports.listingId, id), inArray(reports.status, ['open', 'reviewing'])));
      await tx.update(users).set({ trustScore: sql`greatest(${users.trustScore} - 5, -100)` }).where(eq(users.id, updated.userId));
    });
    return { id, status: 'rejected' as const };
  }
}
