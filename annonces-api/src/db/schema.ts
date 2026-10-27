// Miroir partiel de db/schema.sql (source de vérité = le script SQL).
// On ne déclare ici que les tables/colonnes utilisées par le code.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  customType,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// bit(64) : empreinte perceptuelle d'image, manipulée comme une chaîne de 64 caractères '0'/'1'
const bit64 = customType<{ data: string }>({ dataType: () => 'bit(64)' });

export const userRole = pgEnum('user_role', ['user', 'moderator', 'admin']);
export const userStatus = pgEnum('user_status', ['active', 'suspended', 'banned', 'deleted']);
export const verificationLevel = pgEnum('verification_level', ['phone', 'identity']);
export const blocklistKind = pgEnum('blocklist_kind', ['phone', 'device', 'keyword', 'domain', 'image_hash']);
export const blocklistAction = pgEnum('blocklist_action', ['block', 'flag']);
export const listingStatusEnum = pgEnum('listing_status', [
  'draft', 'pending_review', 'active', 'rejected', 'expired', 'sold', 'removed',
]);
export const priceTypeEnum = pgEnum('price_type', ['fixed', 'negotiable', 'free', 'contact']);
export const itemConditionEnum = pgEnum('item_condition', ['new', 'like_new', 'good', 'fair', 'for_parts']);
export const moderationActionEnum = pgEnum('moderation_action_type', [
  'auto_approve', 'auto_reject', 'send_to_review', 'approve', 'reject', 'remove', 'restore', 'request_changes',
]);

export const reportReasonEnum = pgEnum('report_reason', [
  'scam', 'fake_photos', 'prohibited_item', 'duplicate', 'wrong_category', 'harassment', 'other', 'fake_review',
]);
export const reportStatusEnum = pgEnum('report_status', ['open', 'reviewing', 'resolved', 'dismissed']);
export const sanctionTypeEnum = pgEnum('sanction_type', ['warning', 'suspension', 'ban']);
export const verificationKindEnum = pgEnum('verification_kind', [
  'id_card', 'passport', 'driver_license', 'selfie', 'business_registration',
]);
export const verificationStatusEnum = pgEnum('verification_status', ['pending', 'approved', 'rejected']);

export const countries = pgTable('countries', {
  code: char('code', { length: 2 }).primaryKey(),
  name: text('name').notNull(),
  dialCode: text('dial_code').notNull(),
  currencyCode: char('currency_code', { length: 3 }).notNull(),
  isActive: boolean('is_active').notNull(),
});

/** Historique des acceptations des CGU : la preuve en cas de litige (migration 017). */
export const termsAcceptances = pgTable('terms_acceptances', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull(),
  version: text('version').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  ip: text('ip'),
  platform: text('platform'),
});

/** Portefeuilles électroniques proposés dans chaque pays (migration 016). */
export const countryWallets = pgTable('country_wallets', {
  countryCode: char('country_code', { length: 2 }).notNull(),
  wallet: text('wallet').notNull(),
  position: smallint('position').notNull(),
});

export const cities = pgTable('cities', {
  id: integer('id').primaryKey(),
  countryCode: char('country_code', { length: 2 }).notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  isActive: boolean('is_active').notNull(),
});

export const categories = pgTable('categories', {
  id: integer('id').primaryKey(),
  parentId: integer('parent_id'),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  requiresVerification: boolean('requires_verification').notNull(),
  sortOrder: integer('sort_order').notNull(),
  attributesSchema: jsonb('attributes_schema').$type<Record<string, unknown>>().notNull(), // formulaire, voir categories/category-forms.ts
  isActive: boolean('is_active').notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phoneE164: text('phone_e164').unique(), // NULL pour un compte supprimé (migration 002)
  email: text('email'), // connexion par e-mail (migration 015), unique sans tenir compte des majuscules
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  passwordHash: text('password_hash'), // scrypt, jamais renvoyé au client
  termsVersion: text('terms_version'), // version des CGU acceptée (migration 017)
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  countryCode: char('country_code', { length: 2 }).notNull(),
  cityId: integer('city_id'),
  displayName: text('display_name').notNull().default('Utilisateur'),
  role: userRole('role').notNull().default('user'),
  status: userStatus('status').notNull().default('active'),
  verificationLevel: verificationLevel('verification_level').notNull().default('phone'),
  trustScore: smallint('trust_score').notNull().default(0),
  // Avis reçus (migration 010) : tenus à jour par un déclencheur
  ratingAvg: numeric('rating_avg', { precision: 2, scale: 1, mode: 'number' }),
  ratingCount: integer('rating_count').notNull().default(0),
  dailyListingLimit: smallint('daily_listing_limit').notNull().default(3),
  avatarKey: text('avatar_key'),
  contactPreference: text('contact_preference').$type<'all' | 'messages_only'>().notNull().default('all'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  fingerprintHash: text('fingerprint_hash').notNull(),
  platform: text('platform').notNull(),
  isBlocked: boolean('is_blocked').notNull().default(false),
  lastIp: inet('last_ip'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  deviceId: uuid('device_id'),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedAt: timestamp('replaced_at', { withTimezone: true }), // remplacé par renouvellement (et non retiré par une déconnexion), migration 019
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const blocklist = pgTable('blocklist', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  kind: blocklistKind('kind').notNull(),
  value: text('value').notNull(),
  action: blocklistAction('action').notNull(),
  reason: text('reason'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AdType = 'offer' | 'request';

// La colonne search_vector (générée) n'est pas déclarée : elle est utilisée en SQL brut.
export const listings = pgTable('listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  categoryId: integer('category_id').notNull(),
  countryCode: char('country_code', { length: 2 }).notNull(),
  cityId: integer('city_id').notNull(),
  districtId: integer('district_id'), // quartier, facultatif (migration 012)
  cityOther: text('city_other'), // ville hors liste, saisie (ville « Autres villes », migration 018)
  districtOther: text('district_other'), // quartier hors liste, saisi (sans district_id, migration 018)
  handDelivery: boolean('hand_delivery'), // remise en main propre ; null = non concerné (migration 014)
  paymentMethods: text('payment_methods').array().notNull().default(sql`'{}'::text[]`), // portefeuilles acceptés (migration 016)
  title: text('title').notNull(),
  description: text('description').notNull(),
  priceType: priceTypeEnum('price_type').notNull().default('fixed'),
  priceXaf: bigint('price_xaf', { mode: 'number' }),
  condition: itemConditionEnum('condition'),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
  adType: text('ad_type').$type<AdType>().notNull().default('offer'), // je propose / je recherche
  status: listingStatusEnum('status').notNull().default('pending_review'),
  rejectionReason: text('rejection_reason'),
  boostUntil: timestamp('boost_until', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const listingImages = pgTable('listing_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').notNull(),
  storageKey: text('storage_key').notNull(),
  position: smallint('position').notNull().default(0),
  width: integer('width'),
  height: integer('height'),
  sha256: text('sha256'),
  phash: bit64('phash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const moderationActions = pgTable('moderation_actions', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  listingId: uuid('listing_id'),
  userId: uuid('user_id'),
  moderatorId: uuid('moderator_id'),
  action: moderationActionEnum('action').notNull(),
  reasonCode: text('reason_code'),
  note: text('note'),
  ruleHits: jsonb('rule_hits').$type<unknown[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').notNull(),
  listingId: uuid('listing_id'),
  reportedUserId: uuid('reported_user_id'),
  conversationId: uuid('conversation_id'),
  reviewId: uuid('review_id'),
  reason: reportReasonEnum('reason').notNull(),
  details: text('details'),
  status: reportStatusEnum('status').notNull().default('open'),
  handledBy: uuid('handled_by'),
  handledAt: timestamp('handled_at', { withTimezone: true }),
  resolutionNote: text('resolution_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sanctions = pgTable('sanctions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  type: sanctionTypeEnum('type').notNull(),
  reason: text('reason').notNull(),
  relatedReportId: uuid('related_report_id'),
  issuedBy: uuid('issued_by'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userVerifications = pgTable('user_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  kind: verificationKindEnum('kind').notNull(),
  storageKey: text('storage_key').notNull(),
  status: verificationStatusEnum('status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Recherches sauvegardées (migration 008) : filtres de GET /listings et date de dernière consultation. */
export const savedSearches = pgTable('saved_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  query: jsonb('query').$type<Record<string, string | number>>().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Panier : liste d'achats, sans paiement (migration 007). */
export const cartItems = pgTable(
  'cart_items',
  {
    userId: uuid('user_id').notNull(),
    listingId: uuid('listing_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listingId] })],
);

/** Avis et notes entre acheteurs et vendeurs (migration 010). */
export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull(),
  listingId: uuid('listing_id').notNull(),
  authorId: uuid('author_id').notNull(),
  targetId: uuid('target_id').notNull(),
  authorRole: text('author_role').$type<'buyer' | 'seller'>().notNull(),
  rating: smallint('rating').notNull(),
  comment: text('comment'),
  status: text('status').$type<'published' | 'hidden'>().notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Candidatures aux offres d'emploi (migration 009). CV privé, lu par le seul recruteur. */
export const jobApplications = pgTable('job_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').notNull(),
  applicantId: uuid('applicant_id').notNull(),
  employerId: uuid('employer_id').notNull(),
  conversationId: uuid('conversation_id'),
  message: text('message').notNull(),
  cvKey: text('cv_key'),
  cvContentType: text('cv_content_type'),
  status: text('status').$type<'sent' | 'viewed' | 'shortlisted' | 'rejected'>().notNull().default('sent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id').notNull(),
    listingId: uuid('listing_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listingId] })],
);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').notNull(),
  buyerId: uuid('buyer_id').notNull(),
  sellerId: uuid('seller_id').notNull(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  lastMessagePreview: text('last_message_preview'),
  lastSenderId: uuid('last_sender_id'),
  buyerLastReadAt: timestamp('buyer_last_read_at', { withTimezone: true }),
  sellerLastReadAt: timestamp('seller_last_read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable('messages', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  conversationId: uuid('conversation_id').notNull(),
  senderId: uuid('sender_id').notNull(),
  body: text('body').notNull(),
  flags: jsonb('flags').$type<string[]>().notNull().default([]),
  // Migration 011 : messages liés à une offre de prix
  kind: text('kind').$type<MessageKind>().notNull().default('text'),
  offerId: uuid('offer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MessageKind = 'text' | 'offer' | 'offer_accepted' | 'offer_declined' | 'offer_withdrawn';
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

/** « Faire une offre » (migration 011) : une seule offre en attente par conversation, valable 48 h. */
export const offers = pgTable('offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull(),
  listingId: uuid('listing_id').notNull(),
  buyerId: uuid('buyer_id').notNull(),
  sellerId: uuid('seller_id').notNull(),
  amountXaf: integer('amount_xaf').notNull(),
  status: text('status').$type<OfferStatus>().notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
});

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id').notNull(),
    blockedId: uuid('blocked_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export type ConversationRow = typeof conversations.$inferSelect;

export type UserRow = typeof users.$inferSelect;
export type ListingRow = typeof listings.$inferSelect;
export type ListingImageRow = typeof listingImages.$inferSelect;

/** Quartiers des villes (migration 012) : choisis dans une liste, facultatifs. */
export const districts = pgTable('districts', {
  id: integer('id').primaryKey(),
  cityId: integer('city_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

/** Comptes Google ou Facebook liés à un utilisateur (migration 013). */
export const userIdentities = pgTable('user_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  provider: text('provider').$type<'google' | 'facebook'>().notNull(),
  subject: text('subject').notNull(),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
