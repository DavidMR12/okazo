import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { RateLimitService } from '../common/rate-limit.service';
import { Database, DB } from '../db/db.module';
import { categories, jobApplications, listings, users } from '../db/schema';
import { StorageService } from '../media/storage.service';
import { MessagingService } from '../messaging/messaging.service';
import { ApplyInput, CV_MAX_BYTES, CV_TYPES, CvContentType, CvUploadInput, EmployerStatus } from './applications.schemas';

/** Dossier PRIVÉ des CV : lus par le seul recruteur, via un lien de 5 minutes. */
const cvKey = (userId: string, ext: string) => `cvs/${userId}/${randomUUID()}.${ext}`;
const isCvKeyOf = (userId: string, key: string) => new RegExp(`^cvs/${userId}/[0-9a-f-]{36}\\.(pdf|jpg|png)$`).test(key);

const DAILY_LIMIT = 20;
const NOT_FOUND = { code: 'APPLICATION_NOT_FOUND', message: 'Candidature introuvable.' };

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
    private readonly messaging: MessagingService,
  ) {}

  /** On ne postule qu'à une offre d'emploi en ligne (catégorie Emploi, « Je propose »), et pas à la sienne. */
  private async jobOffer(userId: string, listingId: string) {
    const [l] = await this.db
      .select({
        id: listings.id,
        sellerId: listings.userId,
        status: listings.status,
        adType: listings.adType,
        parentSlug: sql<string | null>`(select p.slug from categories p where p.id = ${categories.parentId})`,
      })
      .from(listings)
      .innerJoin(categories, eq(categories.id, listings.categoryId))
      .where(eq(listings.id, listingId))
      .limit(1);
    if (!l || l.status !== 'active') throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Cette annonce n’est plus disponible.' });
    if (l.parentSlug !== 'emploi' || l.adType !== 'offer') {
      throw new BadRequestException({ code: 'NOT_A_JOB_OFFER', message: 'On ne peut postuler qu’à une offre d’emploi.' });
    }
    if (l.sellerId === userId) throw new ForbiddenException({ code: 'OWN_LISTING', message: 'C’est votre propre annonce.' });
    return l;
  }

  private async alreadyApplied(userId: string, listingId: string) {
    const [a] = await this.db
      .select({ id: jobApplications.id })
      .from(jobApplications)
      .where(and(eq(jobApplications.listingId, listingId), eq(jobApplications.applicantId, userId)))
      .limit(1);
    return !!a;
  }

  // ------------------------------------------------------------------ candidat
  async cvUploadUrl(userId: string, listingId: string, input: CvUploadInput) {
    await this.jobOffer(userId, listingId);
    await this.rateLimit.hit(`rl:cv-upload:${userId}`, 20, 86400);
    const key = cvKey(userId, CV_TYPES[input.contentType]);
    return {
      key,
      method: 'PUT' as const,
      uploadUrl: await this.storage.presignUpload(key, input.contentType, input.sizeBytes),
      headers: { 'Content-Type': input.contentType },
      expiresInSec: 600,
    };
  }

  async apply(userId: string, listingId: string, input: ApplyInput) {
    const offer = await this.jobOffer(userId, listingId);
    if (await this.alreadyApplied(userId, listingId)) {
      throw new ConflictException({ code: 'ALREADY_APPLIED', message: 'Vous avez déjà postulé à cette offre.' });
    }

    let cvContentType: CvContentType | null = null;
    if (input.cvKey) {
      if (!isCvKeyOf(userId, input.cvKey)) throw new BadRequestException({ code: 'FILE_KEY_INVALID', message: 'Fichier invalide.' });
      const h = await this.storage.head(input.cvKey);
      if (!h) throw new BadRequestException({ code: 'FILE_NOT_UPLOADED', message: 'Le CV n’a pas été envoyé. Réessayez.' });
      if (h.size > CV_MAX_BYTES) throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'CV trop volumineux (5 Mo maximum).' });
      if (!h.contentType || !(h.contentType in CV_TYPES)) throw new BadRequestException({ code: 'FILE_TYPE', message: 'Format de CV non accepté (PDF, JPEG ou PNG).' });
      cvContentType = h.contentType as CvContentType;
    }

    await this.rateLimit.hit(`rl:apply:${userId}`, DAILY_LIMIT, 86400);

    // Le message part aussi dans la messagerie : recruteur et candidat continuent l'échange là-bas.
    // La messagerie applique ses propres garde-fous (compte actif, blocage, anti-spam, avertissements).
    const { conversationId } = await this.messaging.start(userId, listingId, `Candidature${input.cvKey ? ' (CV joint)' : ''}\n\n${input.message}`);

    const [row] = await this.db
      .insert(jobApplications)
      .values({ listingId, applicantId: userId, employerId: offer.sellerId, conversationId, message: input.message, cvKey: input.cvKey ?? null, cvContentType })
      .onConflictDoNothing()
      .returning({ id: jobApplications.id });
    if (!row) throw new ConflictException({ code: 'ALREADY_APPLIED', message: 'Vous avez déjà postulé à cette offre.' });
    return { id: row.id, conversationId, status: 'sent' as const };
  }

  /** Mes candidatures (avec leur statut), ou celle envoyée pour une annonce précise. */
  async mine(userId: string, listingId?: string) {
    const rows = await this.db
      .select({
        id: jobApplications.id,
        listingId: jobApplications.listingId,
        listingTitle: listings.title,
        listingStatus: listings.status,
        status: jobApplications.status,
        hasCv: sql<boolean>`${jobApplications.cvKey} is not null and ${jobApplications.cvKey} <> 'deleted'`,
        conversationId: jobApplications.conversationId,
        createdAt: jobApplications.createdAt,
      })
      .from(jobApplications)
      .innerJoin(listings, eq(listings.id, jobApplications.listingId))
      .where(and(eq(jobApplications.applicantId, userId), listingId ? eq(jobApplications.listingId, listingId) : undefined))
      .orderBy(desc(jobApplications.createdAt))
      .limit(100);
    // Le candidat voit « envoyée », « vue », « retenue » ou « non retenue »
    return { items: rows };
  }

  // ------------------------------------------------------------------ recruteur
  async forListing(userId: string, listingId: string) {
    const [l] = await this.db.select({ sellerId: listings.userId, title: listings.title }).from(listings).where(eq(listings.id, listingId)).limit(1);
    if (!l || l.sellerId !== userId) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' });

    const rows = await this.db
      .select({
        id: jobApplications.id,
        status: jobApplications.status,
        message: jobApplications.message,
        hasCv: sql<boolean>`${jobApplications.cvKey} is not null and ${jobApplications.cvKey} <> 'deleted'`,
        cvContentType: jobApplications.cvContentType,
        conversationId: jobApplications.conversationId,
        createdAt: jobApplications.createdAt,
        applicant: {
          id: users.id,
          displayName: users.displayName,
          verificationLevel: users.verificationLevel,
          memberSince: users.createdAt,
        },
      })
      .from(jobApplications)
      .innerJoin(users, eq(users.id, jobApplications.applicantId))
      .where(eq(jobApplications.listingId, listingId))
      .orderBy(desc(jobApplications.createdAt))
      .limit(200);

    // Ouvrir la liste vaut lecture : le candidat voit « Vue par le recruteur »
    await this.db
      .update(jobApplications)
      .set({ status: 'viewed', updatedAt: new Date() })
      .where(and(eq(jobApplications.listingId, listingId), eq(jobApplications.status, 'sent')));

    return { listing: { id: listingId, title: l.title }, items: rows };
  }

  private async asEmployer(userId: string, applicationId: string) {
    const [a] = await this.db.select().from(jobApplications).where(eq(jobApplications.id, applicationId)).limit(1);
    if (!a || a.employerId !== userId) throw new NotFoundException(NOT_FOUND);
    return a;
  }

  async cvUrl(userId: string, applicationId: string) {
    const a = await this.asEmployer(userId, applicationId);
    if (!a.cvKey || a.cvKey === 'deleted') throw new NotFoundException({ code: 'CV_NOT_FOUND', message: 'Pas de CV pour cette candidature.' });
    await this.rateLimit.hit(`rl:cv-read:${userId}`, 200, 86400);
    return { url: await this.storage.presignDownload(a.cvKey, 300), contentType: a.cvContentType, expiresInSec: 300 };
  }

  async setStatus(userId: string, applicationId: string, status: EmployerStatus) {
    await this.asEmployer(userId, applicationId);
    await this.db.update(jobApplications).set({ status, updatedAt: new Date() }).where(eq(jobApplications.id, applicationId));
    return { id: applicationId, status };
  }
}
