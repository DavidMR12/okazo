import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import {
  ListingRow,
  listingImages,
  listings,
  moderationActions,
  users,
} from '../db/schema';
import { ImageError, ImageProcessorService } from '../media/image-processor.service';
import { fullKey, thumbKey } from '../media/media-keys';
import { StorageService } from '../media/storage.service';
import { RuleHit, RulesService } from './rules.service';

// Messages montrés au vendeur en cas de refus automatique (jamais le détail des règles internes).
const REJECTION_MESSAGES: Record<string, string> = {
  keyword: 'Votre annonce contient des termes non autorisés.',
  domain: 'Les liens vers ce site ne sont pas autorisés.',
  image_hash: "Une des photos n'est pas autorisée.",
  image_from_banned_seller: "Une des photos n'est pas autorisée.",
  image_invalid: 'Une photo est illisible ou trop petite. Utilisez des photos nettes (JPEG, PNG ou WebP).',
};
const DEFAULT_REJECTION = 'Votre annonce ne respecte pas nos règles de publication.';

@Injectable()
export class ModerationService {
  private readonly log = new Logger(ModerationService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
    private readonly images: ImageProcessorService,
    private readonly rules: RulesService,
  ) {}

  /**
   * Pipeline appelé par le worker : traite les photos, applique les règles, puis décide.
   * En cas d'échec technique, l'exception relance le job ; après 3 échecs l'annonce reste
   * "pending_review" et apparaît dans la file des modérateurs (jamais publiée par erreur).
   */
  async process(listingId: string): Promise<void> {
    const [listing] = await this.db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
    if (!listing || listing.status !== 'pending_review') return; // déjà traitée

    const [seller] = await this.db.select().from(users).where(eq(users.id, listing.userId)).limit(1);
    if (!seller) return;

    const invalid = await this.processImages(listing);
    if (invalid) {
      await this.finalize(listing, [{ rule: 'image_invalid', severity: 'reject', detail: invalid }]);
      return;
    }

    const images = await this.db
      .select()
      .from(listingImages)
      .where(eq(listingImages.listingId, listing.id))
      .orderBy(asc(listingImages.position));

    const hits = await this.rules.evaluate(listing, seller, images);
    await this.finalize(listing, hits);
  }

  /** Redimensionne en WebP, supprime les métadonnées, calcule les empreintes. Idempotent. */
  private async processImages(listing: ListingRow): Promise<string | null> {
    const images = await this.db
      .select()
      .from(listingImages)
      .where(eq(listingImages.listingId, listing.id))
      .orderBy(asc(listingImages.position));

    for (const img of images) {
      if (img.sha256) continue; // déjà traitée (nouvel essai, ou annonce modifiée)

      const original = await this.storage.getBuffer(img.storageKey); // erreur réseau => le job est relancé
      let out;
      try {
        out = await this.images.process(original);
      } catch (err) {
        if (err instanceof ImageError) return err.code;
        throw err;
      }

      const full = fullKey(listing.id, img.id);
      await Promise.all([
        this.storage.putBuffer(full, out.full, 'image/webp'),
        this.storage.putBuffer(thumbKey(full), out.thumb, 'image/webp'),
      ]);
      await this.db
        .update(listingImages)
        .set({ storageKey: full, width: out.width, height: out.height, sha256: out.sha256, phash: out.phash })
        .where(eq(listingImages.id, img.id));

      await this.storage.delete(img.storageKey).catch((e) => this.log.warn(`Suppression de l'original impossible : ${e}`));
    }
    return null;
  }

  private async finalize(listing: ListingRow, hits: RuleHit[]): Promise<void> {
    const reject = hits.find((h) => h.severity === 'reject');
    const base = { listingId: listing.id, userId: listing.userId, ruleHits: hits };

    await this.db.transaction(async (tx) => {
      // "where status = pending_review" : ne jamais écraser la décision d'un modérateur humain
      const decide = async (status: 'active' | 'rejected', rejectionReason: string | null) =>
        (
          await tx
            .update(listings)
            .set({ status, rejectionReason })
            .where(and(eq(listings.id, listing.id), eq(listings.status, 'pending_review')))
            .returning({ id: listings.id })
        ).length > 0;

      if (reject) {
        const message = REJECTION_MESSAGES[reject.rule] ?? DEFAULT_REJECTION;
        if (await decide('rejected', message)) {
          await tx.insert(moderationActions).values({ ...base, action: 'auto_reject', reasonCode: reject.rule.toUpperCase() });
        }
      } else if (hits.length > 0) {
        // Reste en attente : visible dans la file des modérateurs avec les règles déclenchées
        await tx.insert(moderationActions).values({ ...base, action: 'send_to_review', reasonCode: hits[0].rule.toUpperCase() });
      } else if (await decide('active', null)) {
        await tx.insert(moderationActions).values({ ...base, action: 'auto_approve' });
      }
    });
  }
}
