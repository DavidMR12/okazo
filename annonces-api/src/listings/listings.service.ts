import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte, ne, or, SQL, sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { decodeCursor, decodePriceCursor, encodeCursor, encodePriceCursor } from '../common/cursor';
import { pgErrorText } from '../common/pg-error';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import { categories, cities, countries, countryWallets, districts, ListingImageRow, listingImages, listings, users } from '../db/schema';
import { isAllowedImageType, isPendingKeyOf, thumbKey } from '../media/media-keys';
import { assertPriceType, CategoryForm, describeAttributes, priceUnit, validateAttributes } from '../categories/category-forms';
import { CategoriesService } from '../categories/categories.service';

// Statuts qu'un vendeur peut modifier (une annonce expirée modifiée est republiée)
const EDITABLE = ['active', 'rejected', 'expired'] as const;
const isEditable = (status: string) => (EDITABLE as readonly string[]).includes(status);
import { StorageService } from '../media/storage.service';
import { ModerationQueue } from '../moderation/moderation.queue';
import { REDIS } from '../redis/redis.module';
import { CreateListingInput, ListQuery, UpdateListingInput } from './listings.schemas';

type PriceType = 'fixed' | 'negotiable' | 'free' | 'contact';
const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'for_parts'] as const;
type ItemCondition = (typeof CONDITIONS)[number];

/** Cohérence prix / type, identique à la contrainte SQL chk_listing_price. */
function resolvePrice(priceType: PriceType, priceXaf: number | null | undefined): number | null {
  if (priceType === 'contact') return null;
  if (priceType === 'free') return 0;
  if (!priceXaf || priceXaf <= 0) {
    throw new BadRequestException({ code: 'PRICE_REQUIRED', message: 'Indiquez un prix.' });
  }
  return priceXaf;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

// Comme sur LeBonCoin : une offre d'emploi ou un service se publie sans photo.
// Partout ailleurs la photo reste obligatoire (elle sert aussi à repérer les photos volées).
const PHOTO_OPTIONAL_PARENTS = ['emploi', 'services'];
/** Remise en main propre : seulement pour les objets proposés ; null quand la question ne se pose pas. */
const NO_HAND_DELIVERY = new Set(['emploi', 'services', 'immobilier']);
export function handDeliveryFor(adType: 'offer' | 'request', parentSlug: string | null, wanted: boolean | null | undefined): boolean | null {
  if (adType !== 'offer' || NO_HAND_DELIVERY.has(parentSlug ?? '')) return null;
  return wanted ?? true;
}

/**
 * Portefeuilles acceptés : seulement pour une annonce « Je propose » hors Emploi, et parmi ceux du pays
 * de l'annonce (un portefeuille d'un autre pays est retiré sans erreur, par exemple après un changement de ville).
 */
async function walletsFor(db: Database, countryCode: string, adType: 'offer' | 'request', parentSlug: string | null, wanted: readonly string[]): Promise<string[]> {
  if (adType !== 'offer' || parentSlug === 'emploi' || !wanted.length) return [];
  const rows = await db.select({ wallet: countryWallets.wallet }).from(countryWallets).where(eq(countryWallets.countryCode, countryCode)).orderBy(countryWallets.position);
  return rows.map((r) => r.wallet).filter((w) => wanted.includes(w));
}

const parentSlugOf = sql<string | null>`(select p.slug from categories p where p.id = categories.parent_id)`;
function assertPhotoCount(count: number, parentSlug: string | null) {
  if (count === 0 && !PHOTO_OPTIONAL_PARENTS.includes(parentSlug ?? '')) {
    throw new BadRequestException({ code: 'PHOTO_REQUIRED', message: 'Ajoutez au moins une photo.' });
  }
}

@Injectable()
export class ListingsService {
  private readonly log = new Logger(ListingsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly storage: StorageService,
    private readonly queue: ModerationQueue,
    private readonly categoriesService: CategoriesService,
  ) {}

  // ------------------------------------------------------------------ création
  async create(userId: string, input: CreateListingInput) {
    const price = resolvePrice(input.priceType, input.priceXaf);

    const [city] = await this.db
      .select({ id: cities.id, countryCode: cities.countryCode })
      .from(cities)
      .innerJoin(countries, eq(countries.code, cities.countryCode))
      .where(and(eq(cities.id, input.cityId), eq(cities.isActive, true), eq(countries.isActive, true)))
      .limit(1);
    if (!city) throw new BadRequestException({ code: 'CITY_NOT_AVAILABLE', message: "Cette ville n'est pas disponible." });
    const districtId = await this.checkDistrict(input.districtId ?? null, city.id);

    // Une annonce se publie dans une sous-catégorie (catégorie sans enfants)
    const [category] = await this.db
      .select({ id: categories.id, parentSlug: parentSlugOf })
      .from(categories)
      .where(
        and(
          eq(categories.id, input.categoryId),
          eq(categories.isActive, true),
          sql`not exists (select 1 from categories c where c.parent_id = ${categories.id})`,
        ),
      )
      .limit(1);
    if (!category) throw new BadRequestException({ code: 'CATEGORY_INVALID', message: 'Catégorie invalide.' });

    // Champs propres à la catégorie (contrat, kilométrage…), types de prix et « état » autorisés
    const form = await this.categoriesService.formFor(category.id);
    assertPriceType(form, input.priceType);
    const attributes = validateAttributes(form, input.attributes, input.adType);
    const condition = form.condition ? (input.condition ?? null) : null;

    assertPhotoCount(input.imageKeys.length, category.parentSlug);
    if (input.imageKeys.length) await this.assertImagesUploaded(userId, input.imageKeys);

    let listingId: string;
    try {
      listingId = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(listings)
          .values({
            userId,
            adType: input.adType,
            categoryId: category.id,
            countryCode: city.countryCode,
            cityId: city.id,
            districtId,
            handDelivery: handDeliveryFor(input.adType, category.parentSlug, input.handDelivery),
            paymentMethods: await walletsFor(this.db, city.countryCode, input.adType, category.parentSlug, input.paymentMethods),
            title: input.title,
            description: input.description,
            priceType: input.priceType,
            priceXaf: price,
            condition,
            attributes,
          })
          .returning({ id: listings.id });
        if (input.imageKeys.length) {
          await tx
            .insert(listingImages)
            .values(input.imageKeys.map((storageKey, position) => ({ listingId: row.id, storageKey, position })));
        }
        return row.id;
      });
    } catch (err) {
      throw this.mapDbError(err);
    }

    await this.enqueueModeration(listingId);
    return { id: listingId, status: 'pending_review' as const };
  }

  private async assertImagesUploaded(userId: string, keys: string[]) {
    if (!keys.every((k) => isPendingKeyOf(userId, k))) {
      throw new BadRequestException({ code: 'IMAGE_KEY_INVALID', message: 'Photo invalide.' });
    }
    const heads = await Promise.all(keys.map((k) => this.storage.head(k)));
    for (const h of heads) {
      if (!h) throw new BadRequestException({ code: 'IMAGE_NOT_UPLOADED', message: "Une photo n'a pas été envoyée." });
      if (h.size > env.MAX_IMAGE_BYTES) throw new BadRequestException({ code: 'IMAGE_TOO_LARGE', message: 'Photo trop volumineuse.' });
      if (!isAllowedImageType(h.contentType)) throw new BadRequestException({ code: 'IMAGE_TYPE', message: 'Format de photo non accepté.' });
    }
    const used = await this.db
      .select({ id: listingImages.id })
      .from(listingImages)
      .where(inArray(listingImages.storageKey, keys))
      .limit(1);
    if (used.length) throw new ConflictException({ code: 'IMAGE_ALREADY_USED', message: 'Photo déjà utilisée.' });
  }

  private async enqueueModeration(listingId: string) {
    try {
      await this.queue.enqueue(listingId);
    } catch (err) {
      // Redis indisponible : l'annonce reste "pending_review" et sera visible des modérateurs.
      this.log.error(`Impossible de planifier la modération de ${listingId} : ${(err as Error).message}`);
    }
  }

  /** Traduit les erreurs levées par les déclencheurs SQL (voir schema.sql) en réponses HTTP claires. */
  private mapDbError(err: unknown): unknown {
    const text = pgErrorText(err);
    if (text.includes('DAILY_LISTING_LIMIT_REACHED')) {
      return new HttpException(
        { code: 'DAILY_LISTING_LIMIT_REACHED', message: "Limite d'annonces atteinte pour aujourd'hui. Réessayez demain." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (text.includes('IDENTITY_VERIFICATION_REQUIRED')) {
      return new ForbiddenException({
        code: 'IDENTITY_VERIFICATION_REQUIRED',
        message: 'Vérifiez votre identité pour publier dans cette catégorie.',
      });
    }
    if (text.includes('USER_NOT_ACTIVE')) {
      return new ForbiddenException({ code: 'USER_NOT_ACTIVE', message: 'Votre compte ne permet pas de publier.' });
    }
    return err;
  }

  // ------------------------------------------------------------------ lecture publique
  /**
   * Conditions communes à la liste, au comptage et aux recherches sauvegardées :
   * annonces en ligne d'un vendeur actif, puis les filtres de la recherche.
   * since : seulement les annonces publiées après cette date (nouveautés d'une recherche sauvegardée).
   */
  private async filterConditions(q: ListQuery, since?: Date): Promise<(SQL | undefined)[]> {
    const now = new Date();
    const conditions = (q.condition ?? '').split(',').filter((c): c is ItemCondition => (CONDITIONS as readonly string[]).includes(c));
    const attributeConds = q.categoryId ? this.attributeFilters(await this.categoriesService.formFor(q.categoryId), q) : [];
    return [
      ...attributeConds,
      eq(listings.status, 'active'),
      gt(listings.expiresAt, now),
      eq(users.status, 'active'),
      q.country ? eq(listings.countryCode, q.country) : undefined,
      q.cityId ? eq(listings.cityId, q.cityId) : undefined,
      q.districtId ? eq(listings.districtId, q.districtId) : undefined,
      q.handDelivery ? eq(listings.handDelivery, true) : undefined,
      q.wallet ? sql`${listings.paymentMethods} @> array[${q.wallet}]::text[]` : undefined,
      q.sellerId ? eq(listings.userId, q.sellerId) : undefined,
      q.adType ? eq(listings.adType, q.adType) : undefined,
      conditions.length ? inArray(listings.condition, conditions) : undefined,
      since ? gt(listings.publishedAt, since) : undefined,
      // catégorie choisie + ses sous-catégories
      q.categoryId
        ? sql`${listings.categoryId} in (select id from categories where id = ${q.categoryId} or parent_id = ${q.categoryId})`
        : undefined,
      q.minPrice !== undefined ? gte(listings.priceXaf, q.minPrice) : undefined,
      q.maxPrice !== undefined ? lte(listings.priceXaf, q.maxPrice) : undefined,
      q.q
        ? sql`(listings.search_vector @@ websearch_to_tsquery('french', ${q.q}) or ${listings.title} ilike ${`%${escapeLike(q.q)}%`})`
        : undefined,
    ];
  }

  /** Nombre de résultats d'une recherche (bouton « Voir les N annonces », nouveautés des recherches sauvegardées). */
  async count(q: ListQuery, since?: Date): Promise<number> {
    const [r] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(listings)
      .innerJoin(users, eq(users.id, listings.userId))
      .where(and(...(await this.filterConditions(q, since))));
    return Number(r?.n ?? 0);
  }

  async list(q: ListQuery) {
    const now = new Date();
    const base = await this.filterConditions(q);
    const byPrice = q.sort === 'price_asc' || q.sort === 'price_desc';

    const fields = {
      id: listings.id,
      adType: listings.adType,
      attributes: listings.attributes,
      title: listings.title,
      priceType: listings.priceType,
      priceXaf: listings.priceXaf,
      condition: listings.condition,
      categoryId: listings.categoryId,
      cityName: cities.name,
      districtName: sql<string | null>`(select d.name from districts d where d.id = ${listings.districtId})`,
      publishedAt: listings.publishedAt,
      boostUntil: listings.boostUntil,
      cursorTs: sql<string>`${listings.publishedAt}::text`,
    };

    // Pagination par curseur, stable dans les trois tris. Tri par prix : les annonces « prix sur demande »
    // (sans prix) en sont exclues, elles n'ont pas de place dans un classement par prix.
    let feedConds: (SQL | undefined)[];
    let order: SQL[];
    if (byPrice) {
      const ascending = q.sort === 'price_asc';
      const c = q.cursor ? decodePriceCursor(q.cursor) : null;
      feedConds = [
        ...base,
        isNotNull(listings.priceXaf),
        c
          ? ascending
            ? sql`(${listings.priceXaf}, ${listings.id}) > (${c.p}, ${c.i}::uuid)`
            : sql`(${listings.priceXaf}, ${listings.id}) < (${c.p}, ${c.i}::uuid)`
          : undefined,
      ];
      order = ascending ? [asc(listings.priceXaf), asc(listings.id)] : [desc(listings.priceXaf), desc(listings.id)];
    } else {
      const c = q.cursor ? decodeCursor(q.cursor) : null;
      feedConds = c ? [...base, sql`(${listings.publishedAt}, ${listings.id}) < (${c.t}::timestamptz, ${c.i}::uuid)`] : base;
      order = [desc(listings.publishedAt), desc(listings.id)];
    }

    const [rows, featured] = await Promise.all([
      this.db
        .select(fields)
        .from(listings)
        .innerJoin(users, eq(users.id, listings.userId))
        .innerJoin(cities, eq(cities.id, listings.cityId))
        .where(and(...feedConds))
        .orderBy(...order)
        .limit(q.limit + 1),
      // Annonces boostées : mises en avant sur la première page du tri par défaut uniquement.
      // Elles peuvent aussi apparaître dans le flux normal : le client déduplique par id.
      q.cursor || byPrice
        ? Promise.resolve([])
        : this.db
            .select(fields)
            .from(listings)
            .innerJoin(users, eq(users.id, listings.userId))
            .innerJoin(cities, eq(cities.id, listings.cityId))
            .where(and(...base, gt(listings.boostUntil, now)))
            .orderBy(desc(listings.boostUntil))
            .limit(3),
    ]);

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const thumbs = await this.thumbnails([...new Set([...page, ...featured].map((r) => r.id))]);
    const forms = new Map<number, CategoryForm>();
    for (const id of new Set([...page, ...featured].map((r) => r.categoryId))) forms.set(id, await this.categoriesService.formFor(id));
    const toItem = (r: (typeof rows)[number]) => ({
      id: r.id,
      adType: r.adType,
      title: r.title,
      priceType: r.priceType,
      priceXaf: r.priceXaf,
      priceUnit: priceUnit(forms.get(r.categoryId)!, r.attributes), // « mois », « h »… ou null
      condition: r.condition,
      categoryId: r.categoryId,
      city: r.cityName,
      district: r.districtName, // « Akwa » : affiché « Akwa, Douala »
      publishedAt: r.publishedAt,
      boosted: !!r.boostUntil && r.boostUntil > now,
      thumbnailUrl: thumbs.get(r.id) ?? null,
    });

    const last = page[page.length - 1];
    let nextCursor: string | null = null;
    if (hasMore && last) nextCursor = byPrice ? encodePriceCursor(last.priceXaf!, last.id) : encodeCursor(last.cursorTs, last.id);
    return { featured: featured.map(toItem), items: page.map(toItem), nextCursor };
  }

  /**
   * Filtres sur les champs de la catégorie (seulement ceux marqués « filter ») :
   * a_brand=toyota,lexus ; a_year_min=2010 ; a_mileage_max=150000. Les autres paramètres sont ignorés.
   */
  private attributeFilters(form: CategoryForm, q: Record<string, unknown>): SQL[] {
    const conds: SQL[] = [];
    const value = (k: string) => (typeof q[k] === 'string' ? (q[k] as string).trim() : '');
    for (const f of form.fields) {
      if (!f.filter) continue;
      if (f.type === 'select') {
        const wanted = value(`a_${f.key}`).split(',').filter((v) => f.options.some((o) => o.value === v));
        if (wanted.length) {
          conds.push(sql`(${listings.attributes} ->> ${f.key}) in (${sql.join(wanted.map((v) => sql`${v}`), sql`, `)})`);
        }
      } else if (f.type === 'number') {
        const min = Number(value(`a_${f.key}_min`));
        const max = Number(value(`a_${f.key}_max`));
        // Les champs numériques sont enregistrés comme nombres JSON : la conversion est sûre
        if (value(`a_${f.key}_min`) && Number.isFinite(min)) conds.push(sql`(${listings.attributes} ->> ${f.key})::numeric >= ${min}`);
        if (value(`a_${f.key}_max`) && Number.isFinite(max)) conds.push(sql`(${listings.attributes} ->> ${f.key})::numeric <= ${max}`);
      }
    }
    return conds;
  }

  /** Annonces en ligne pour le plan du site (sitemap.xml) : les plus récentes d'abord, 5 000 maximum. */
  async sitemap() {
    const rows = await this.db
      .select({ id: listings.id, title: listings.title, updatedAt: listings.updatedAt })
      .from(listings)
      .innerJoin(users, eq(users.id, listings.userId))
      .where(and(eq(listings.status, 'active'), eq(users.status, 'active'), gt(listings.expiresAt, new Date())))
      .orderBy(desc(listings.publishedAt))
      .limit(5000);
    return { items: rows };
  }

  async detail(id: string) {
    const now = new Date();
    const [row] = await this.db
      .select({
        l: listings,
        cityName: cities.name,
        districtName: sql<string | null>`(select d.name from districts d where d.id = ${listings.districtId})`,
        categoryName: categories.name,
        // Requête avec jointures : Drizzle qualifie la colonne ("categories"."parent_id")
        categoryParentSlug: sql<string | null>`(select p.slug from categories p where p.id = ${categories.parentId})`,
        sellerId: users.id,
        sellerContact: users.contactPreference,
        sellerName: users.displayName,
        sellerLevel: users.verificationLevel,
        sellerSince: users.createdAt,
        sellerRatingAvg: users.ratingAvg,
        sellerRatingCount: users.ratingCount,
      })
      .from(listings)
      .innerJoin(users, eq(users.id, listings.userId))
      .innerJoin(cities, eq(cities.id, listings.cityId))
      .innerJoin(categories, eq(categories.id, listings.categoryId))
      .where(
        and(
          eq(listings.id, id),
          eq(users.status, 'active'),
          or(eq(listings.status, 'sold'), and(eq(listings.status, 'active'), gt(listings.expiresAt, now))),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' });

    const imgs = await this.db
      .select()
      .from(listingImages)
      .where(eq(listingImages.listingId, id))
      .orderBy(listingImages.position);

    const l = row.l;
    const form = await this.categoriesService.formFor(l.categoryId);
    return {
      id: l.id,
      adType: l.adType,
      status: l.status,
      title: l.title,
      description: l.description,
      priceType: l.priceType,
      priceXaf: l.priceXaf,
      condition: l.condition,
      attributes: l.attributes,
      facts: describeAttributes(form, l.attributes), // « Type de contrat : CDI », « Kilométrage : 98 000 km »
      priceLabel: l.adType === 'request' ? form.price.requestLabel : form.price.label,
      priceUnit: priceUnit(form, l.attributes),
      city: row.cityName,
      district: row.districtName,
      handDelivery: l.handDelivery,
      paymentMethods: l.paymentMethods,
      countryCode: l.countryCode,
      category: { id: l.categoryId, name: row.categoryName, parentSlug: row.categoryParentSlug },
      publishedAt: l.publishedAt,
      images: imgs.map((i) => ({
        url: this.storage.publicUrl(i.storageKey),
        thumbUrl: this.storage.publicUrl(thumbKey(i.storageKey)),
        width: i.width,
        height: i.height,
      })),
      seller: { id: row.sellerId, contactPreference: row.sellerContact, displayName: row.sellerName, verificationLevel: row.sellerLevel, memberSince: row.sellerSince, ratingAvg: row.sellerRatingAvg, ratingCount: row.sellerRatingCount },
    };
  }

  /** Quartier facultatif : s'il est donné, il doit être actif et dans la ville de l'annonce. */
  private async checkDistrict(districtId: number | null, cityId: number): Promise<number | null> {
    if (!districtId) return null;
    const [d] = await this.db
      .select({ id: districts.id })
      .from(districts)
      .where(and(eq(districts.id, districtId), eq(districts.cityId, cityId), eq(districts.isActive, true)))
      .limit(1);
    if (!d) throw new BadRequestException({ code: 'DISTRICT_INVALID', message: "Ce quartier n'est pas dans la ville choisie." });
    return d.id;
  }

  /**
   * Catégories principales les plus fournies d'un pays (annonces en ligne), avec la miniature
   * de l'annonce la plus récente qui a une photo : cartes « Catégories populaires » de l'accueil.
   */
  async popularCategories(country: string, limit = 6) {
    const rows = (await this.db.execute(sql`
      select p.id, p.slug, p.name, count(l.id)::int as count,
        (select li.storage_key
           from listings l2
           join categories c2 on c2.id = l2.category_id
           join listing_images li on li.listing_id = l2.id and li.position = 0 and li.storage_key like 'listings/%'
          where (c2.parent_id = p.id or c2.id = p.id) and l2.status = 'active' and l2.expires_at > now() and l2.country_code = ${country}
          order by l2.published_at desc
          limit 1) as image_key
        from categories p
        join categories c on c.parent_id = p.id or c.id = p.id
        join listings l on l.category_id = c.id and l.status = 'active' and l.expires_at > now() and l.country_code = ${country}
       where p.parent_id is null and p.is_active
       group by p.id
       order by count desc, p.name
       limit ${limit}`)) as unknown as { id: number; slug: string; name: string; count: number; image_key: string | null }[];
    return {
      categories: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        count: Number(r.count),
        imageUrl: r.image_key ? this.storage.publicUrl(thumbKey(r.image_key)) : null,
      })),
    };
  }

  async mine(userId: string) {
    const rows = await this.db
      .select({
        id: listings.id,
        adType: listings.adType,
        title: listings.title,
        status: listings.status,
        rejectionReason: listings.rejectionReason,
        priceType: listings.priceType,
        priceXaf: listings.priceXaf,
        createdAt: listings.createdAt,
        expiresAt: listings.expiresAt,
        // Offres d'emploi : candidatures reçues, dont les nouvelles (pas encore vues). « listings.id » écrit en clair :
        // dans une requête sur une seule table, Drizzle n'écrit pas le nom de la table et « id » viserait la sous-requête.
        applications: sql<number>`(select count(*)::int from job_applications a where a.listing_id = listings.id)`,
        parentSlug: sql<string | null>`(select p.slug from categories c join categories p on p.id = c.parent_id where c.id = listings.category_id)`,
        newApplications: sql<number>`(select count(*)::int from job_applications a where a.listing_id = listings.id and a.status = 'sent')`,
      })
      .from(listings)
      .where(and(eq(listings.userId, userId), ne(listings.status, 'removed')))
      .orderBy(desc(listings.createdAt))
      .limit(100);
    const thumbs = await this.thumbnails(rows.map((r) => r.id));
    return { items: rows.map((r) => ({ ...r, thumbnailUrl: thumbs.get(r.id) ?? null })) };
  }

  /** Miniature (photo n°1) de chaque annonce, pour les listes. Utilisé aussi par les favoris. */
  async thumbnails(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({ listingId: listingImages.listingId, key: listingImages.storageKey })
      .from(listingImages)
      .where(and(inArray(listingImages.listingId, ids), eq(listingImages.position, 0)));
    // Seules les photos déjà traitées (dossier listings/) sont publiques
    return new Map(rows.filter((r) => r.key.startsWith('listings/')).map((r) => [r.listingId, this.storage.publicUrl(thumbKey(r.key))]));
  }

  // ------------------------------------------------------------------ actions du vendeur
  /** Annonce complète pour son propriétaire, quel que soit son statut (pour la modifier). */
  async mineDetail(userId: string, id: string) {
    const [l] = await this.db
      .select()
      .from(listings)
      .where(and(eq(listings.id, id), eq(listings.userId, userId), ne(listings.status, 'removed')))
      .limit(1);
    if (!l) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' });
    const imgs = await this.db
      .select()
      .from(listingImages)
      .where(eq(listingImages.listingId, id))
      .orderBy(listingImages.position);
    return {
      id: l.id,
      adType: l.adType,
      status: l.status,
      rejectionReason: l.rejectionReason,
      title: l.title,
      description: l.description,
      priceType: l.priceType,
      priceXaf: l.priceXaf,
      condition: l.condition,
      categoryId: l.categoryId,
      cityId: l.cityId,
      districtId: l.districtId,
      handDelivery: l.handDelivery,
      paymentMethods: l.paymentMethods,
      attributes: l.attributes,
      editable: isEditable(l.status),
      photos: imgs.map((i) => ({
        key: i.storageKey,
        processed: i.storageKey.startsWith('listings/'),
        url: i.storageKey.startsWith('listings/') ? this.storage.publicUrl(thumbKey(i.storageKey)) : null,
      })),
    };
  }

  /**
   * Modification d'une annonce en ligne, refusée ou expirée. Toute modification repasse par la
   * modération : sinon on pourrait publier une annonce banale puis la transformer en arnaque.
   */
  async update(userId: string, id: string, input: UpdateListingInput) {
    const [current] = await this.db
      .select()
      .from(listings)
      .where(and(eq(listings.id, id), eq(listings.userId, userId)))
      .limit(1);
    if (!current) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' });
    if (current.status === 'pending_review') {
      // Bloqué pendant l'analyse : une modification à ce moment pourrait être publiée sans être vérifiée
      throw new ConflictException({ code: 'IN_REVIEW', message: 'Annonce en cours de vérification : réessayez dans quelques minutes.' });
    }
    if (!isEditable(current.status)) {
      throw new ConflictException({ code: 'NOT_EDITABLE', message: 'Cette annonce ne peut plus être modifiée.' });
    }

    const priceType = input.priceType ?? current.priceType;
    const price = resolvePrice(priceType, input.priceXaf !== undefined ? input.priceXaf : current.priceXaf);

    // ---- catégorie : mêmes règles qu'à la création, y compris l'identité vérifiée ----
    const adType = input.adType ?? current.adType;
    let categoryId = current.categoryId;
    const categoryChanged = input.categoryId !== undefined && input.categoryId !== current.categoryId;
    if (categoryChanged || (adType === 'offer' && current.adType === 'request')) {
      const [cat] = await this.db
        .select({ id: categories.id, requires: categories.requiresVerification, parentRequires: sql<boolean>`coalesce((select p.requires_verification from categories p where p.id = categories.parent_id), false)` })
        .from(categories)
        .where(and(eq(categories.id, input.categoryId ?? current.categoryId), eq(categories.isActive, true), sql`not exists (select 1 from categories c where c.parent_id = ${categories.id})`))
        .limit(1);
      if (!cat) throw new BadRequestException({ code: 'CATEGORY_INVALID', message: 'Catégorie invalide.' });
      // Chercher (un emploi, un logement, une nounou…) ne demande pas de vérification
      if (adType === 'offer' && (cat.requires || cat.parentRequires)) {
        const [u] = await this.db.select({ level: users.verificationLevel }).from(users).where(eq(users.id, userId)).limit(1);
        if (u?.level !== 'identity') {
          throw new ForbiddenException({ code: 'IDENTITY_VERIFICATION_REQUIRED', message: 'Vérifiez votre identité pour publier dans cette catégorie.' });
        }
      }
      categoryId = cat.id;
    }

    // ---- champs de la catégorie : revalidés si la catégorie, le type d'annonce ou les champs changent ----
    const form = await this.categoriesService.formFor(categoryId);
    assertPriceType(form, priceType);
    const attributes =
      input.attributes !== undefined || categoryId !== current.categoryId || adType !== current.adType
        ? validateAttributes(form, input.attributes ?? current.attributes, adType)
        : current.attributes;
    const condition = form.condition ? (input.condition !== undefined ? input.condition : current.condition) : null;

    // ---- ville : doit rester dans un pays ouvert ----
    let cityId = current.cityId;
    let countryCode = current.countryCode;
    if (input.cityId !== undefined && input.cityId !== current.cityId) {
      const [city] = await this.db
        .select({ id: cities.id, countryCode: cities.countryCode })
        .from(cities)
        .innerJoin(countries, eq(countries.code, cities.countryCode))
        .where(and(eq(cities.id, input.cityId), eq(cities.isActive, true), eq(countries.isActive, true)))
        .limit(1);
      if (!city) throw new BadRequestException({ code: 'CITY_NOT_AVAILABLE', message: "Cette ville n'est pas disponible." });
      cityId = city.id;
      countryCode = city.countryCode;
    }
    const districtId = await this.checkDistrict(
      input.districtId !== undefined ? input.districtId : cityId === current.cityId ? current.districtId : null,
      cityId,
    );

    // ---- photos : liste complète et ordonnée (anciennes gardées + nouvelles) ----
    const existing: ListingImageRow[] = await this.db.select().from(listingImages).where(eq(listingImages.listingId, id));
    let removedFiles: string[] = [];
    if (input.photos) {
      const byKey = new Map<string, ListingImageRow>(existing.map((i) => [i.storageKey, i]));
      const fresh = input.photos.filter((k) => !byKey.has(k));
      if (fresh.some((k) => !isPendingKeyOf(userId, k))) {
        throw new BadRequestException({ code: 'IMAGE_KEY_INVALID', message: 'Photo invalide.' });
      }
      if (fresh.length) await this.assertImagesUploaded(userId, fresh);
      const kept = new Set(input.photos);
      removedFiles = existing
        .filter((i) => !kept.has(i.storageKey))
        .flatMap((i) => (i.storageKey.startsWith('listings/') ? [i.storageKey, thumbKey(i.storageKey)] : [i.storageKey]));
    }
    // Sans photo : seulement pour l'emploi et les services (même règle qu'à la création)
    if ((input.photos ? input.photos.length : existing.length) === 0) {
      const [cat] = await this.db.select({ parentSlug: parentSlugOf }).from(categories).where(eq(categories.id, categoryId)).limit(1);
      assertPhotoCount(0, cat?.parentSlug ?? null);
    }

    // ---- remise en main propre : recalculée si la catégorie ou le type d'annonce change ----
    const [catOfListing] = await this.db.select({ parentSlug: parentSlugOf }).from(categories).where(eq(categories.id, categoryId)).limit(1);
    const handDelivery = handDeliveryFor(adType, catOfListing?.parentSlug ?? null, input.handDelivery !== undefined ? input.handDelivery : current.handDelivery);
    const paymentMethods = await walletsFor(this.db, countryCode, adType, catOfListing?.parentSlug ?? null, input.paymentMethods ?? current.paymentMethods);

    const wasExpired = current.status === 'expired';
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(listings)
        .set({
          title: input.title ?? current.title,
          description: input.description ?? current.description,
          adType,
          priceType,
          priceXaf: price,
          condition,
          attributes,
          categoryId,
          cityId,
          districtId,
          handDelivery,
          paymentMethods,
          countryCode,
          status: 'pending_review',
          rejectionReason: null,
          // Annonce expirée republiée : nouvelles dates de publication et d'expiration à l'approbation
          ...(wasExpired ? { publishedAt: null, expiresAt: null } : {}),
        })
        .where(and(eq(listings.id, id), eq(listings.userId, userId), inArray(listings.status, [...EDITABLE])))
        .returning({ id: listings.id });
      if (!row) return null;

      if (input.photos) {
        // Réécriture complète de l'ordre : on conserve les empreintes des photos gardées (inutile de les retraiter)
        const byKey = new Map<string, ListingImageRow>(existing.map((i) => [i.storageKey, i]));
        await tx.delete(listingImages).where(eq(listingImages.listingId, id));
        if (input.photos.length) {
          await tx.insert(listingImages).values(
            input.photos.map((key, position) => {
              const old = byKey.get(key);
              return old
                ? { id: old.id, listingId: id, storageKey: key, position, width: old.width, height: old.height, sha256: old.sha256, phash: old.phash }
                : { listingId: id, storageKey: key, position };
            }),
          );
        }
      }
      return row;
    });
    if (!updated) throw new ConflictException({ code: 'NOT_EDITABLE', message: 'Cette annonce ne peut plus être modifiée.' });

    // Fichiers des photos retirées : supprimés après validation (la purge du bucket rattrape un échec)
    await Promise.allSettled(removedFiles.map((k) => this.storage.delete(k)));
    await this.enqueueModeration(id);
    return { id, status: 'pending_review' as const };
  }

  async markSold(userId: string, id: string) {
    const rows = await this.db
      .update(listings)
      .set({ status: 'sold' })
      .where(and(eq(listings.id, id), eq(listings.userId, userId), eq(listings.status, 'active')))
      .returning({ id: listings.id });
    if (!rows.length) throw new NotFoundException({ code: 'LISTING_NOT_ACTIVE', message: 'Annonce introuvable ou non active.' });
    return { id, status: 'sold' as const };
  }

  async remove(userId: string, id: string) {
    const rows = await this.db
      .update(listings)
      .set({ status: 'removed' })
      .where(and(eq(listings.id, id), eq(listings.userId, userId), ne(listings.status, 'removed')))
      .returning({ id: listings.id });
    if (!rows.length) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' });
  }

  // ------------------------------------------------------------------ contact vendeur
  /**
   * Le numéro n'est jamais dans les listes ni dans le détail public : il faut être connecté,
   * et le nombre de vendeurs consultables par jour est limité (anti-moissonnage par les fraudeurs).
   */
  async contact(userId: string, id: string) {
    const [row] = await this.db
      .select({ title: listings.title, phone: users.phoneE164, contactPreference: users.contactPreference })
      .from(listings)
      .innerJoin(users, eq(users.id, listings.userId))
      .where(and(eq(listings.id, id), eq(listings.status, 'active'), eq(users.status, 'active')))
      .limit(1);
    if (!row?.phone) throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' });
    if (row.contactPreference === 'messages_only') {
      throw new ForbiddenException({ code: 'MESSAGES_ONLY', message: 'Ce vendeur préfère être contacté par la messagerie.' });
    }

    const key = `contact:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const added = await this.redis.sadd(key, id); // consulter deux fois la même annonce compte pour une
    if (added === 1) {
      if ((await this.redis.ttl(key)) < 0) await this.redis.expire(key, 86400);
      if ((await this.redis.scard(key)) > env.CONTACT_DAILY_LIMIT) {
        await this.redis.srem(key, id);
        throw new HttpException(
          { code: 'CONTACT_LIMIT_REACHED', message: 'Limite de contacts atteinte pour aujourd’hui.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const text = encodeURIComponent(`Bonjour, votre annonce « ${row.title} » est-elle toujours disponible ?`);
    return { phone: row.phone, whatsappUrl: `https://wa.me/${row.phone.replace('+', '')}?text=${text}` };
  }
}
