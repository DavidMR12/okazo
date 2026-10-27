export type PriceType = 'fixed' | 'negotiable' | 'free' | 'contact';
export type ListingStatus = 'draft' | 'pending_review' | 'active' | 'rejected' | 'expired' | 'sold' | 'removed';
export type VerificationLevel = 'phone' | 'identity';
export type ContactPreference = 'all' | 'messages_only';

export interface Country { code: string; name: string; dialCode: string; currencyCode: string; wallets?: string[] } // wallets : portefeuilles électroniques du pays
export interface City { id: number; countryCode: string; name: string; slug: string }
/** Formulaire d'une catégorie, décrit par l'API (champs, libellé du prix, « état » proposé ou non). */
export interface SelectOption { value: string; label: string; unit?: string }
export type FormField =
  | { key: string; label: string; required?: boolean; filter?: boolean; type: 'select'; options: SelectOption[] }
  | { key: string; label: string; required?: boolean; filter?: boolean; type: 'number'; min?: number; max?: number; unit?: string }
  | { key: string; label: string; required?: boolean; filter?: boolean; type: 'text'; maxLength?: number; placeholder?: string };
export interface CategoryForm {
  fields: FormField[];
  price: { label: string; requestLabel: string; types: PriceType[]; unit?: string; unitFrom?: string };
  condition: boolean;
}
export interface Category { id: number; slug: string; name: string; requiresVerification: boolean; form?: CategoryForm; children?: Category[] } // form absent : ancienne réponse en cache

import type { AdType } from '../lib/adType';

export interface ListingCard {
  id: string;
  adType: AdType;
  title: string;
  priceType: PriceType;
  priceXaf: number | null;
  priceUnit?: string | null; // « mois », « h »…
  condition: string | null;
  categoryId: number;
  city: string;
  district?: string | null; // quartier, facultatif : « Akwa »
  publishedAt: string | null;
  boosted: boolean;
  thumbnailUrl: string | null;
}

export interface ListingsPage { featured: ListingCard[]; items: ListingCard[]; nextCursor: string | null }

export interface ListingDetail {
  id: string;
  adType: AdType;
  status: ListingStatus;
  title: string;
  description: string;
  priceType: PriceType;
  priceXaf: number | null;
  condition: string | null;
  attributes: Record<string, unknown>;
  facts: { key: string; label: string; value: string }[]; // caractéristiques lisibles
  priceLabel: string; // « Prix », « Salaire mensuel », « Loyer mensuel »…
  priceUnit: string | null;
  city: string;
  district?: string | null;
  handDelivery?: boolean | null; // remise en main propre ; null : non concerné
  paymentMethods?: string[]; // portefeuilles électroniques acceptés (mtn_momo, orange_money…)
  countryCode: string;
  category: { id: number; name: string; parentSlug?: string | null };
  publishedAt: string | null;
  images: { url: string; thumbUrl: string; width: number | null; height: number | null }[];
  seller: { id: string; displayName: string; verificationLevel: VerificationLevel; memberSince: string; contactPreference: ContactPreference; ratingAvg?: number | null; ratingCount?: number };
}

export interface Me {
  id: string;
  phone: string | null; // null : compte créé avec Google ou Facebook, numéro pas encore vérifié
  email?: string | null; // connexion par e-mail (migration 015)
  termsVersion?: string | null; // version des CGU acceptée (migration 017)
  identities?: ('google' | 'facebook')[];
  countryCode: string;
  cityId: number | null;
  displayName: string;
  role: 'user' | 'moderator' | 'admin';
  status: 'active' | 'suspended' | 'banned';
  verificationLevel: VerificationLevel;
  contactPreference: ContactPreference;
}

export interface SellerProfile {
  id: string;
  displayName: string;
  verificationLevel: VerificationLevel;
  countryCode: string;
  memberSince: string;
  city: string | null;
  activeListings: number;
  soldListings: number;
  ratingAvg?: number | null;
  ratingCount?: number;
}

export interface FavoriteItem {
  id: string;
  title: string;
  priceType: PriceType;
  priceXaf: number | null;
  city: string;
  status: ListingStatus;
  available: boolean;
  favoritedAt: string;
  thumbnailUrl: string | null;
}

/** Panier : liste d'achats regroupée par vendeur (aucun paiement dans l'application). */
export interface CartItem {
  id: string;
  title: string;
  priceType: PriceType;
  priceXaf: number | null;
  priceUnit: string | null;
  city: string;
  available: boolean; // vendue, expirée ou vendeur suspendu : grisée
  thumbnailUrl: string | null;
}
export interface CartSeller {
  seller: { id: string; displayName: string; verificationLevel: VerificationLevel; contactPreference: ContactPreference };
  items: CartItem[];
  total: number;
}
export interface CartPayload { sellers: CartSeller[]; count: number; total: number }

export interface MyListing {
  id: string;
  adType: AdType;
  title: string;
  status: ListingStatus;
  rejectionReason: string | null;
  priceType: PriceType;
  priceXaf: number | null;
  createdAt: string;
  expiresAt: string | null;
  thumbnailUrl: string | null;
  parentSlug: string | null; // catégorie principale (« emploi » : offres avec candidatures)
  applications: number;
  newApplications: number;
}

export interface VerificationStatus {
  level: VerificationLevel;
  request: { status: 'pending' | 'approved' | 'rejected'; rejectionReason: string | null; submittedAt: string } | null;
}

export type ReportReason = 'scam' | 'fake_photos' | 'prohibited_item' | 'duplicate' | 'wrong_category' | 'harassment' | 'other';

export interface FeedFilters {
  country?: string;
  cityId?: number;
  districtId?: number;
  handDelivery?: boolean; // seulement les annonces avec remise en main propre
  wallet?: string; // seulement les annonces qui acceptent ce portefeuille
  categoryId?: number;
  q?: string;
  sellerId?: string;
  adType?: AdType; // offres ou demandes
  minPrice?: number;
  maxPrice?: number;
  condition?: string; // « new,like_new »
  sort?: 'recent' | 'price_asc' | 'price_desc';
  attrs?: Record<string, string>; // champs de la catégorie : brand → « toyota », year_min → « 2010 »
}

export interface SavedSearch { id: string; name: string; query: Record<string, string | number>; newCount: number; createdAt: string }

// ---------------------------------------------------------------- messagerie
export type MessageFlag = 'advance_payment' | 'money_transfer' | 'link' | 'code_request';

export interface ChatMessage {
  id: number; // négatif : message en cours d’envoi (affichage immédiat)
  senderId: string;
  body: string;
  flags: MessageFlag[];
  // Offre de prix : 'offer' (la proposition), puis 'offer_accepted' / 'offer_declined' / 'offer_withdrawn'
  kind?: 'text' | 'offer' | 'offer_accepted' | 'offer_declined' | 'offer_withdrawn';
  offer?: { id: string; amountXaf: number; status: OfferStatus } | null;
  createdAt: string;
  failed?: boolean;
  queued?: boolean; // écrit hors connexion : part au retour du réseau
}

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

export interface Person { id: string; displayName: string; verificationLevel: VerificationLevel; status: string }

export interface InboxItem {
  id: string;
  role: 'buyer' | 'seller';
  listing: { id: string; title: string; status: ListingStatus; thumbnailUrl: string | null };
  other: Person | null;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  lastFromMe: boolean;
  unread: boolean;
}

export interface ConversationMeta {
  id: string;
  role: 'buyer' | 'seller';
  listing: { id: string; title: string; status: ListingStatus; priceType: PriceType; priceXaf: number | null; thumbnailUrl: string | null; parentSlug?: string | null; adType?: 'offer' | 'request' } | null;
  other: Person | null;
  iBlocked: boolean;
}

export interface ConversationPayload {
  conversation: ConversationMeta | null;
  otherLastReadAt: string | null;
  messages: ChatMessage[];
  hasOlder: boolean;
}

/** Candidatures aux offres d'emploi. */
export type ApplicationStatus = 'sent' | 'viewed' | 'shortlisted' | 'rejected';
export interface MyApplication {
  id: string;
  listingId: string;
  listingTitle: string;
  listingStatus: string;
  status: ApplicationStatus;
  hasCv: boolean;
  conversationId: string | null;
  createdAt: string;
}
export interface ReceivedApplication {
  id: string;
  status: ApplicationStatus;
  message: string;
  hasCv: boolean;
  cvContentType: string | null;
  conversationId: string | null;
  createdAt: string;
  applicant: { id: string; displayName: string; verificationLevel: 'phone' | 'identity'; memberSince: string };
}

/** Avis et notes (1 à 5 étoiles). */
export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  authorRole: 'buyer' | 'seller';
  createdAt: string;
  authorName?: string;
  listingTitle?: string;
  listingParentSlug?: string | null;
}
export interface ReviewsPage {
  summary: { average: number | null; count: number; distribution?: Record<string, number> };
  items: Review[];
  nextCursor: string | null;
}
export interface ReviewStatus {
  canReview: boolean;
  parentSlug?: string | null;
  reason: { code: string; message: string } | null;
  role: 'buyer' | 'seller';
  target: { id: string; displayName: string } | null;
  mine: Review | null;
}

/** Quartier d'une ville (facultatif dans une annonce). */
export interface District { id: number; cityId: number; name: string; slug: string }
