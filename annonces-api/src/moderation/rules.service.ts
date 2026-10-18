import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import {
  blocklist,
  ListingImageRow,
  ListingRow,
  listingImages,
  listings,
  UserRow,
  users,
} from '../db/schema';

export interface RuleHit {
  rule: string;
  severity: 'reject' | 'review'; // reject = refus automatique ; review = relecture humaine
  detail?: string;
}

interface TextRule {
  kind: string;
  action: string;
  value: string;
  re: RegExp;
}

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LINK_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(com|net|org|info|xyz|biz|top|site|online|link|ly|me|co)\b/;

const MAX_HAMMING = 6; // distance maximale entre deux empreintes pour parler de "même photo"

@Injectable()
export class RulesService {
  private textRulesCache: { rules: TextRule[]; at: number } | null = null;

  constructor(@Inject(DB) private readonly db: Database) {}

  async evaluate(listing: ListingRow, user: UserRow, images: ListingImageRow[]): Promise<RuleHit[]> {
    const results = await Promise.all([
      this.textRules(listing),
      this.priceRule(listing),
      this.imageRules(listing, images),
      this.duplicateListingRule(listing),
      this.sellerRules(user),
    ]);
    return results.flat();
  }

  // --- Mots-clés et domaines (table blocklist, modifiable sans redéploiement) ---
  private async textRules(listing: ListingRow): Promise<RuleHit[]> {
    const text = normalize(`${listing.title} ${listing.description}`);
    const hits: RuleHit[] = [];

    for (const r of await this.loadTextRules()) {
      if (r.re.test(text)) {
        hits.push({ rule: r.kind, severity: r.action === 'block' ? 'reject' : 'review', detail: r.value });
      }
    }
    if (LINK_RE.test(text)) hits.push({ rule: 'external_link', severity: 'review' });
    return hits;
  }

  private async loadTextRules(): Promise<TextRule[]> {
    const now = Date.now();
    if (this.textRulesCache && now - this.textRulesCache.at < 60_000) return this.textRulesCache.rules;

    const rows = await this.db
      .select({ kind: blocklist.kind, action: blocklist.action, value: blocklist.value })
      .from(blocklist)
      .where(inArray(blocklist.kind, ['keyword', 'domain']));

    const rules = rows.map((r) => ({
      ...r,
      re: new RegExp(`\\b${escapeRe(normalize(r.value))}\\b`),
    }));
    this.textRulesCache = { rules, at: now };
    return rules;
  }

  // --- Prix anormalement bas par rapport à la médiane de la catégorie ---
  private async priceRule(listing: ListingRow): Promise<RuleHit[]> {
    if (listing.priceXaf === null || listing.priceXaf <= 0) return [];

    const [ref] = await this.db
      .select({
        n: sql<number>`count(*)::int`,
        median: sql<number | null>`percentile_cont(0.5) within group (order by ${listings.priceXaf})`,
      })
      .from(listings)
      .where(
        and(
          eq(listings.status, 'active'),
          eq(listings.categoryId, listing.categoryId),
          eq(listings.countryCode, listing.countryCode),
          isNotNull(listings.priceXaf),
          ne(listings.id, listing.id),
        ),
      );

    // Il faut assez d'annonces pour que la médiane ait un sens
    if (!ref || Number(ref.n) < 10 || ref.median === null) return [];
    const median = Number(ref.median);
    if (median > 0 && listing.priceXaf < median * env.MODERATION_PRICE_LOW_RATIO) {
      return [{ rule: 'price_too_low', severity: 'review', detail: `prix ${listing.priceXaf} vs médiane ${Math.round(median)}` }];
    }
    return [];
  }

  // --- Photos volées ou réutilisées par d'autres vendeurs (fraude n°1) ---
  private async imageRules(listing: ListingRow, images: ListingImageRow[]): Promise<RuleHit[]> {
    const hits: RuleHit[] = [];
    const shas = images.map((i) => i.sha256).filter((s): s is string => !!s);
    const ownerIds = new Set<string>();

    if (shas.length) {
      const blocked = await this.db
        .select({ id: blocklist.id })
        .from(blocklist)
        .where(and(eq(blocklist.kind, 'image_hash'), eq(blocklist.action, 'block'), inArray(blocklist.value, shas)))
        .limit(1);
      if (blocked.length) hits.push({ rule: 'image_hash', severity: 'reject' });

      const exact = await this.db
        .select({ ownerId: listings.userId })
        .from(listingImages)
        .innerJoin(listings, eq(listings.id, listingImages.listingId))
        .where(
          and(
            inArray(listingImages.sha256, shas),
            ne(listings.userId, listing.userId),
            inArray(listings.status, ['active', 'sold', 'pending_review', 'removed']),
          ),
        )
        .limit(20);
      exact.forEach((r) => ownerIds.add(r.ownerId));
    }

    const near = await Promise.all(
      images
        .filter((i) => i.phash)
        .map(
          (i) =>
            this.db.execute(
              sql`select owner_id from find_similar_images(${i.phash}::bit(64), ${MAX_HAMMING}::integer, ${listing.userId}::uuid)`,
            ) as unknown as Promise<Array<{ owner_id: string }>>,
        ),
    );
    near.flat().forEach((r) => ownerIds.add(r.owner_id));

    if (ownerIds.size) {
      const banned = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, [...ownerIds]), eq(users.status, 'banned')))
        .limit(1);
      hits.push(
        banned.length
          ? { rule: 'image_from_banned_seller', severity: 'reject' }
          : { rule: 'duplicate_image', severity: 'review', detail: `${ownerIds.size} autre(s) vendeur(s)` },
      );
    }
    return hits;
  }

  // --- Même vendeur qui republie la même annonce (spam) ---
  private async duplicateListingRule(listing: ListingRow): Promise<RuleHit[]> {
    const dup = await this.db
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          eq(listings.userId, listing.userId),
          ne(listings.id, listing.id),
          eq(listings.categoryId, listing.categoryId),
          sql`lower(${listings.title}) = lower(${listing.title})`,
          inArray(listings.status, ['active', 'pending_review']),
        ),
      )
      .limit(1);
    return dup.length ? [{ rule: 'duplicate_listing', severity: 'review' }] : [];
  }

  // --- Ancienneté et fiabilité du vendeur ---
  private async sellerRules(user: UserRow): Promise<RuleHit[]> {
    const hits: RuleHit[] = [];
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(listings)
      .where(and(eq(listings.userId, user.id), inArray(listings.status, ['active', 'sold', 'expired'])));

    const approved = Number(row?.n ?? 0);
    if (approved < env.MODERATION_TRUSTED_AFTER) {
      hits.push({ rule: 'new_seller', severity: 'review', detail: `${approved} annonce(s) déjà approuvée(s)` });
    }
    if (user.trustScore < 0) hits.push({ rule: 'low_trust', severity: 'review' });
    return hits;
  }
}
