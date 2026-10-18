import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, ne } from 'drizzle-orm';
import Redis from 'ioredis';
import { OtpService } from '../auth/otp.service';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import { blocklist, cartItems, conversations, favorites, jobApplications, reviews, savedSearches, userIdentities, listingImages, listings, messages, refreshTokens, userVerifications, users } from '../db/schema';
import { thumbKey } from '../media/media-keys';
import { StorageService } from '../media/storage.service';
import { REDIS } from '../redis/redis.module';
import { revokedUserKey } from '../sanctions/sanctions.service';

/**
 * Suppression de compte, exigée par Apple et Google (depuis l'application) et par la protection des données.
 *
 * Le compte est ANONYMISÉ plutôt qu'effacé : les annonces, signalements et sanctions y font référence,
 * et l'historique anti-fraude doit rester cohérent. Sont supprimés : numéro, nom, ville, photos des annonces,
 * pièces d'identité, favoris, sessions. Sont conservés : empreintes des photos (non personnelles, utiles
 * contre les photos volées), empreintes d'appareils hachées, historique de modération.
 */
@Injectable()
export class AccountDeletionService {
  private readonly log = new Logger(AccountDeletionService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly otp: OtpService,
    private readonly storage: StorageService,
  ) {}

  private async activeUser(userId: string) {
    const [u] = await this.db
      .select({ phone: users.phoneE164, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u?.phone || u.status === 'deleted') throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Compte introuvable.' });
    if (u.status === 'banned') {
      throw new ForbiddenException({ code: 'ACCOUNT_BANNED', message: 'Contactez le support pour toute demande concernant ce compte.' });
    }
    return { phone: u.phone };
  }

  /** Étape 1 : un code SMS confirme que c'est bien le titulaire (un jeton volé ne suffit pas). */
  async requestCode(userId: string, ip: string) {
    const { phone } = await this.activeUser(userId);
    return this.otp.request(phone, ip);
  }

  /** Étape 2 : suppression définitive. */
  async delete(userId: string, code: string): Promise<void> {
    const { phone } = await this.activeUser(userId);
    await this.otp.verify(phone, code);

    const files: string[] = [];

    await this.db.transaction(async (tx) => {
      const [u] = await tx
        .select({ status: users.status, trustScore: users.trustScore })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!u || u.status === 'deleted' || u.status === 'banned') {
        throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Compte introuvable.' });
      }

      // Supprimer son compte ne doit pas effacer une sanction : le numéro reste « à surveiller »
      if (u.status === 'suspended' || u.trustScore < 0) {
        await tx
          .insert(blocklist)
          .values({ kind: 'phone', value: phone, action: 'flag', reason: 'Compte supprimé sous sanction ou avec un historique négatif' })
          .onConflictDoNothing({ target: [blocklist.kind, blocklist.value] });
      }

      await tx
        .update(listings)
        .set({ status: 'removed', rejectionReason: 'Compte supprimé' })
        .where(and(eq(listings.userId, userId), ne(listings.status, 'removed')));

      const imgs = await tx
        .select({ key: listingImages.storageKey })
        .from(listingImages)
        .innerJoin(listings, eq(listings.id, listingImages.listingId))
        .where(eq(listings.userId, userId));
      for (const { key } of imgs) {
        files.push(key);
        if (key.startsWith('listings/')) files.push(thumbKey(key));
      }

      // Pièces d'identité : on lit les clés AVANT de les effacer, sinon les fichiers resteraient dans le stockage
      const docs = await tx
        .select({ key: userVerifications.storageKey })
        .from(userVerifications)
        .where(and(eq(userVerifications.userId, userId), ne(userVerifications.storageKey, 'deleted')));
      files.push(...docs.map((d) => d.key));
      await tx.update(userVerifications).set({ storageKey: 'deleted' }).where(eq(userVerifications.userId, userId));

      await tx.delete(favorites).where(eq(favorites.userId, userId));
      await tx.delete(cartItems).where(eq(cartItems.userId, userId));
      await tx.delete(savedSearches).where(eq(savedSearches.userId, userId));
      await tx.delete(userIdentities).where(eq(userIdentities.userId, userId)); // comptes Google ou Facebook liés
      // Avis donnés : la note reste (elle compte pour l'autre personne), le texte est effacé
      await tx.update(reviews).set({ comment: null }).where(eq(reviews.authorId, userId));
      // Candidatures envoyées : les CV (fichiers privés) sont effacés, la candidature aussi
      const cvs = await tx.select({ key: jobApplications.cvKey }).from(jobApplications).where(eq(jobApplications.applicantId, userId));
      files.push(...cvs.map((c) => c.key).filter((k): k is string => !!k && k !== 'deleted'));
      await tx.delete(jobApplications).where(eq(jobApplications.applicantId, userId));
      // Messages : le contenu est effacé, l'interlocuteur voit « Message supprimé »
      await tx.update(messages).set({ body: 'Message supprimé', flags: [] }).where(eq(messages.senderId, userId));
      await tx.update(conversations).set({ lastMessagePreview: 'Message supprimé' }).where(eq(conversations.lastSenderId, userId));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

      await tx
        .update(users)
        .set({ phoneE164: null, email: null, passwordHash: null, displayName: 'Utilisateur supprimé', avatarKey: null, cityId: null, status: 'deleted', deletedAt: new Date() })
        .where(eq(users.id, userId));
    });

    await this.redis.set(revokedUserKey(userId), '1', 'EX', env.ACCESS_TOKEN_TTL_SEC).catch(() => undefined);

    // Fichiers supprimés après validation (en cas d'échec, la purge du bucket les rattrapera)
    const results = await Promise.allSettled(files.map((k) => this.storage.delete(k)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) this.log.warn(`${failed} fichier(s) non supprimé(s) pour le compte ${userId}`);
  }
}
