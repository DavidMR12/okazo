import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { AuthUser } from '../auth/auth.types';
import { pgErrorText } from '../common/pg-error';
import { RateLimitService } from '../common/rate-limit.service';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import { blocklist, listingImages, listings, moderationActions, reports, reviews, users } from '../db/schema';
import { IssuedSanction, SanctionsService } from '../sanctions/sanctions.service';
import { AdminReportsQuery, CreateReportInput, ResolveReportInput } from './reports.schemas';

const OPEN = ['open', 'reviewing'] as const;

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rateLimit: RateLimitService,
    private readonly sanctions: SanctionsService,
  ) {}

  // ------------------------------------------------------------------ côté utilisateur
  /**
   * 3 signalements de personnes différentes renvoient automatiquement l'annonce en revue humaine
   * (déclencheur SQL trg_reports_threshold). Un signalement ne supprime jamais rien seul :
   * cela empêche un concurrent de faire retirer une annonce honnête.
   */
  async create(reporterId: string, input: CreateReportInput) {
    await this.rateLimit.hit(`rl:report:${reporterId}`, env.REPORTS_DAILY_LIMIT, 86400);

    const [reporter] = await this.db.select({ status: users.status }).from(users).where(eq(users.id, reporterId)).limit(1);
    if (!reporter || reporter.status !== 'active') {
      throw new ForbiddenException({ code: 'USER_NOT_ACTIVE', message: 'Votre compte ne permet pas de signaler.' });
    }

    if (input.listingId) {
      const [l] = await this.db
        .select({ userId: listings.userId, status: listings.status })
        .from(listings)
        .where(eq(listings.id, input.listingId))
        .limit(1);
      if (!l || !['active', 'sold', 'pending_review'].includes(l.status)) {
        throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' });
      }
      if (l.userId === reporterId) {
        throw new BadRequestException({ code: 'OWN_LISTING', message: 'Vous ne pouvez pas signaler votre propre annonce.' });
      }
    } else {
      if (input.userId === reporterId) {
        throw new BadRequestException({ code: 'SELF_REPORT', message: 'Vous ne pouvez pas vous signaler vous-même.' });
      }
      const [u] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, input.userId!)).limit(1);
      if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });
    }

    try {
      const [row] = await this.db
        .insert(reports)
        .values({
          reporterId,
          listingId: input.listingId ?? null,
          reportedUserId: input.userId ?? null,
          reason: input.reason,
          details: input.details ?? null,
        })
        .returning({ id: reports.id });
      return { id: row.id, status: 'open' as const, message: 'Merci. Notre équipe va examiner ce signalement.' };
    } catch (err) {
      if (pgErrorText(err).includes('ux_reports_open')) {
        throw new ConflictException({ code: 'ALREADY_REPORTED', message: 'Vous avez déjà signalé ceci. Il est en cours d’examen.' });
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------ côté modérateurs
  async list(q: AdminReportsQuery) {
    const statuses = q.status === 'open' ? [...OPEN] : [q.status];
    const rows = await this.db
      .select({
        id: reports.id,
        reason: reports.reason,
        details: reports.details,
        status: reports.status,
        createdAt: reports.createdAt,
        reporterId: reports.reporterId,
        listingId: reports.listingId,
        listingTitle: listings.title,
        listingStatus: listings.status,
        listingOwnerId: listings.userId,
        reportedUserId: reports.reportedUserId,
        conversationId: reports.conversationId,
        // Avis signalé : la note et le texte, pour décider sans quitter la page
        reviewId: reports.reviewId,
        reviewRating: reviews.rating,
        reviewComment: reviews.comment,
        reviewStatus: reviews.status,
        reportedUserName: users.displayName,
        reportedUserStatus: users.status,
        openReportsOnTarget: sql<number>`(
          select count(*)::int from reports r2
           where r2.status in ('open', 'reviewing')
             and ((r2.listing_id is not null and r2.listing_id = ${reports.listingId})
               or (r2.reported_user_id is not null and r2.reported_user_id = ${reports.reportedUserId})))`,
      })
      .from(reports)
      .leftJoin(listings, eq(listings.id, reports.listingId))
      .leftJoin(users, eq(users.id, reports.reportedUserId))
      .leftJoin(reviews, eq(reviews.id, reports.reviewId))
      .where(inArray(reports.status, statuses))
      // Les arnaques d'abord, puis les plus anciens
      .orderBy(desc(sql`${reports.reason} = 'scam'`), q.status === 'open' ? asc(reports.createdAt) : desc(reports.createdAt))
      .limit(q.limit)
      .offset(q.offset);

    return { items: rows.map((r) => ({ ...r, openReportsOnTarget: Number(r.openReportsOnTarget) })) };
  }

  /**
   * Traite un signalement ET tous les autres signalements ouverts sur la même cible.
   * Tout est fait dans une seule transaction : retrait, blocage des photos, sanction.
   */
  async resolve(actor: AuthUser, reportId: string, dto: ResolveReportInput) {
    const result = await this.db.transaction(async (tx) => {
      let issued: IssuedSanction | null = null;
      const [r] = await tx.select().from(reports).where(eq(reports.id, reportId)).for('update');
      if (!r) throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Signalement introuvable.' });
      if (!(OPEN as readonly string[]).includes(r.status)) {
        throw new ConflictException({ code: 'ALREADY_HANDLED', message: 'Ce signalement a déjà été traité.' });
      }

      const sameTarget = r.listingId ? eq(reports.listingId, r.listingId) : eq(reports.reportedUserId, r.reportedUserId!);
      let ownerId: string | null = r.reportedUserId;
      let listingRemoved = false;
      let imagesBlocked = 0;
      let listingRestored = false;

      if (r.listingId) {
        const [l] = await tx
          .select({ userId: listings.userId, status: listings.status })
          .from(listings)
          .where(eq(listings.id, r.listingId))
          .limit(1);
        ownerId = l?.userId ?? null;

        if (dto.decision === 'uphold' && l) {
          if (dto.removeListing && l.status !== 'removed') {
            await tx
              .update(listings)
              .set({ status: 'removed', rejectionReason: 'Annonce retirée suite à un signalement.' })
              .where(eq(listings.id, r.listingId));
            await tx.insert(moderationActions).values({
              listingId: r.listingId,
              userId: l.userId,
              moderatorId: actor.id,
              action: 'remove',
              reasonCode: `REPORT_${r.reason.toUpperCase()}`,
              note: dto.note,
            });
            listingRemoved = true;
          }

          if (dto.blockImages) {
            const hashes = await tx
              .select({ sha: listingImages.sha256 })
              .from(listingImages)
              .where(and(eq(listingImages.listingId, r.listingId), isNotNull(listingImages.sha256)));
            if (hashes.length) {
              const inserted = await tx
                .insert(blocklist)
                .values(
                  hashes.map((h) => ({
                    kind: 'image_hash' as const,
                    value: h.sha!,
                    action: 'block' as const,
                    reason: `Photo frauduleuse (signalement ${r.id})`,
                    createdBy: actor.id,
                  })),
                )
                .onConflictDoNothing({ target: [blocklist.kind, blocklist.value] })
                .returning({ id: blocklist.id });
              imagesBlocked = inserted.length;
            }
          }
        }

        // Signalements infondés sur une annonce mise en revue par le seuil automatique : on la remet en ligne.
        if (dto.decision === 'dismiss' && l?.status === 'pending_review') {
          const [last] = await tx
            .select({ reasonCode: moderationActions.reasonCode })
            .from(moderationActions)
            .where(eq(moderationActions.listingId, r.listingId))
            .orderBy(desc(moderationActions.createdAt))
            .limit(1);
          if (last?.reasonCode === 'REPORTS_THRESHOLD') {
            const restored = await tx
              .update(listings)
              .set({ status: 'active' })
              .where(and(eq(listings.id, r.listingId), eq(listings.status, 'pending_review')))
              .returning({ id: listings.id });
            if (restored.length) {
              await tx.insert(moderationActions).values({
                listingId: r.listingId,
                userId: l.userId,
                moderatorId: actor.id,
                action: 'restore',
                reasonCode: 'REPORTS_DISMISSED',
                note: dto.note,
              });
              listingRestored = true;
            }
          }
        }
      }

      if (dto.decision === 'uphold' && dto.sanction) {
        if (!ownerId) throw new BadRequestException({ code: 'NO_TARGET_USER', message: 'Aucun utilisateur à sanctionner.' });
        issued = await this.sanctions.issue(tx, actor, { ...dto.sanction, userId: ownerId, relatedReportId: r.id });
      }

      const status = dto.decision === 'uphold' ? 'resolved' : 'dismissed';
      const closed = await tx
        .update(reports)
        .set({ status, handledBy: actor.id, handledAt: new Date(), resolutionNote: dto.note ?? null })
        .where(and(sameTarget, inArray(reports.status, [...OPEN])))
        .returning({ reporterId: reports.reporterId, reviewId: reports.reviewId });

      // Avis signalés à raison : masqués (ils ne comptent plus dans la note moyenne)
      const reviewIds = closed.map((c) => c.reviewId).filter((x): x is string => !!x);
      let reviewsHidden = 0;
      if (status === 'resolved' && reviewIds.length) {
        reviewsHidden = (await tx.update(reviews).set({ status: 'hidden' }).where(inArray(reviews.id, reviewIds)).returning({ id: reviews.id })).length;
      }

      // Les utilisateurs dont le signalement était fondé gagnent en fiabilité
      if (status === 'resolved' && closed.length) {
        await tx
          .update(users)
          .set({ trustScore: sql`least(${users.trustScore} + 1, 100)` })
          .where(inArray(users.id, [...new Set(closed.map((c) => c.reporterId))]));
      }

      return { status, closedReports: closed.length, listingRemoved, listingRestored, imagesBlocked, reviewsHidden, issued };
    });

    // Variable renvoyée par la transaction (TypeScript ne suit pas les affectations faites dans un callback)
    const { issued, ...summary } = result;
    if (issued) await this.sanctions.afterCommit(issued);
    return { ...summary, sanction: issued };
  }
}
