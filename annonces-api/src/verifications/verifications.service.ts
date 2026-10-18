import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
import { RateLimitService } from '../common/rate-limit.service';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import { userVerifications, users } from '../db/schema';
import { IMAGE_TYPES, isAllowedImageType, isVerificationKeyOf, verificationKey } from '../media/media-keys';
import { StorageService } from '../media/storage.service';
import {
  ReviewVerificationInput,
  SubmitVerificationInput,
  VerificationUploadUrlsInput,
} from './verifications.schemas';

const DOCUMENT_KINDS = ['id_card', 'passport', 'driver_license'] as const;

@Injectable()
export class VerificationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
  ) {}

  // ------------------------------------------------------------------ côté utilisateur
  async uploadUrls(userId: string, input: VerificationUploadUrlsInput) {
    await this.rateLimit.hit(`rl:verif-upload:${userId}`, 10, 86400);
    const uploads = await Promise.all(
      input.files.map(async (f) => {
        const key = verificationKey(userId, randomUUID(), IMAGE_TYPES[f.contentType]);
        return {
          key,
          method: 'PUT' as const,
          uploadUrl: await this.storage.presignUpload(key, f.contentType, f.sizeBytes),
          headers: { 'Content-Type': f.contentType },
        };
      }),
    );
    return { uploads, expiresInSec: 600 };
  }

  async submit(userId: string, input: SubmitVerificationInput) {
    await this.rateLimit.hit(`rl:verif-submit:${userId}`, env.VERIFICATIONS_DAILY_LIMIT, 86400);

    for (const key of [input.documentKey, input.selfieKey]) {
      if (!isVerificationKeyOf(userId, key)) {
        throw new BadRequestException({ code: 'FILE_KEY_INVALID', message: 'Fichier invalide.' });
      }
      const h = await this.storage.head(key);
      if (!h) throw new BadRequestException({ code: 'FILE_NOT_UPLOADED', message: "Une photo n'a pas été envoyée." });
      if (h.size > env.MAX_IMAGE_BYTES) throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Photo trop volumineuse.' });
      if (!isAllowedImageType(h.contentType)) throw new BadRequestException({ code: 'FILE_TYPE', message: 'Format de photo non accepté.' });
    }

    await this.db.transaction(async (tx) => {
      // Verrou sur l'utilisateur : empêche deux envois simultanés
      const [u] = await tx
        .select({ status: users.status, level: users.verificationLevel })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!u || u.status !== 'active') {
        throw new ForbiddenException({ code: 'USER_NOT_ACTIVE', message: 'Votre compte ne permet pas cette action.' });
      }
      if (u.level === 'identity') {
        throw new ConflictException({ code: 'ALREADY_VERIFIED', message: 'Votre identité est déjà vérifiée.' });
      }
      const [pending] = await tx
        .select({ id: userVerifications.id })
        .from(userVerifications)
        .where(and(eq(userVerifications.userId, userId), eq(userVerifications.status, 'pending')))
        .limit(1);
      if (pending) {
        throw new ConflictException({ code: 'VERIFICATION_PENDING', message: 'Une demande est déjà en cours de vérification.' });
      }

      await tx.insert(userVerifications).values([
        { userId, kind: input.documentKind, storageKey: input.documentKey },
        { userId, kind: 'selfie', storageKey: input.selfieKey },
      ]);
    });

    return { status: 'pending' as const, message: 'Demande envoyée. Elle sera examinée sous 48 h.' };
  }

  async status(userId: string) {
    const [u] = await this.db.select({ level: users.verificationLevel }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });
    if (u.level === 'identity') return { level: 'identity' as const, request: null };

    const rows = await this.db
      .select({ kind: userVerifications.kind, status: userVerifications.status, reason: userVerifications.rejectionReason, at: userVerifications.createdAt })
      .from(userVerifications)
      .where(eq(userVerifications.userId, userId))
      .orderBy(desc(userVerifications.createdAt))
      .limit(2);
    if (!rows.length) return { level: u.level, request: null };

    const rejected = rows.find((r) => r.status === 'rejected');
    return {
      level: u.level,
      request: {
        status: rows.some((r) => r.status === 'pending') ? 'pending' : rejected ? 'rejected' : rows[0].status,
        rejectionReason: rejected?.reason ?? null,
        submittedAt: rows[0].at,
      },
    };
  }

  // ------------------------------------------------------------------ côté modérateurs
  /** Demandes en attente, les plus anciennes d'abord. Les photos sont servies par liens temporaires (5 min). */
  async pending(limit: number) {
    const rows = await this.db
      .select({
        id: userVerifications.id,
        userId: userVerifications.userId,
        kind: userVerifications.kind,
        storageKey: userVerifications.storageKey,
        createdAt: userVerifications.createdAt,
        displayName: users.displayName,
        phone: users.phoneE164,
        countryCode: users.countryCode,
        memberSince: users.createdAt,
      })
      .from(userVerifications)
      .innerJoin(users, eq(users.id, userVerifications.userId))
      .where(eq(userVerifications.status, 'pending'))
      .orderBy(asc(userVerifications.createdAt))
      .limit(limit * 2);

    const byUser = new Map<string, typeof rows>();
    for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);

    const items = await Promise.all(
      [...byUser.values()].slice(0, limit).map(async (group) => {
        const doc = group.find((g) => (DOCUMENT_KINDS as readonly string[]).includes(g.kind));
        const selfie = group.find((g) => g.kind === 'selfie');
        const first = group[0];
        return {
          userId: first.userId,
          displayName: first.displayName,
          phone: first.phone,
          countryCode: first.countryCode,
          memberSince: first.memberSince,
          submittedAt: first.createdAt,
          document: doc ? { kind: doc.kind, url: await this.storage.presignDownload(doc.storageKey) } : null,
          selfie: selfie ? { url: await this.storage.presignDownload(selfie.storageKey) } : null,
        };
      }),
    );
    return { items, linksExpireInSec: 300 };
  }

  /**
   * Décide pour l'ensemble de la demande (pièce + selfie). À l'approbation, le déclencheur SQL
   * trg_verification_upgrade fait passer le compte au niveau "identity" (limite de 10 annonces/jour,
   * accès à l'immobilier et aux véhicules).
   */
  async review(reviewer: AuthUser, userId: string, dto: ReviewVerificationInput) {
    if (reviewer.id === userId) {
      throw new ForbiddenException({ code: 'SELF_REVIEW', message: 'Vous ne pouvez pas valider votre propre identité.' });
    }
    const status = dto.decision === 'approve' ? 'approved' : 'rejected';

    const updated = await this.db
      .update(userVerifications)
      .set({
        status,
        reviewedBy: reviewer.id,
        reviewedAt: new Date(),
        rejectionReason: status === 'rejected' ? dto.rejectionReason! : null,
      })
      .where(and(eq(userVerifications.userId, userId), eq(userVerifications.status, 'pending')))
      .returning({ kind: userVerifications.kind });

    if (!updated.length) throw new NotFoundException({ code: 'NO_PENDING_REQUEST', message: 'Aucune demande en attente.' });

    const [u] = await this.db.select({ level: users.verificationLevel }).from(users).where(eq(users.id, userId)).limit(1);
    return { userId, decision: dto.decision, verificationLevel: u?.level ?? null };
  }
}
