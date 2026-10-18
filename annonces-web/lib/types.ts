export type PriceType = 'fixed' | 'negotiable' | 'free' | 'contact';
export type ListingStatus = 'draft' | 'pending_review' | 'active' | 'rejected' | 'expired' | 'sold' | 'removed';

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

import type { AdType } from './adType';

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
  priceLabel: string; // « Prix », « Salaire mensuel », « Loyer mensuel »…
  priceUnit: string | null;
  facts: { key: string; label: string; value: string }[];
  condition: string | null;
  city: string;
  district?: string | null;
  handDelivery?: boolean | null; // remise en main propre ; null : non concerné (emploi, services, immobilier, demandes)
  paymentMethods?: string[]; // portefeuilles électroniques acceptés (mtn_momo, orange_money…)
  countryCode: string;
  category: { id: number; name: string; parentSlug?: string | null };
  publishedAt: string | null;
  images: { url: string; thumbUrl: string; width: number | null; height: number | null }[];
  seller: { id: string; displayName: string; verificationLevel: 'phone' | 'identity'; memberSince: string; contactPreference: 'all' | 'messages_only'; ratingAvg?: number | null; ratingCount?: number };
}

export interface SellerProfile {
  ratingAvg?: number | null;
  ratingCount?: number;
  id: string;
  displayName: string;
  verificationLevel: 'phone' | 'identity';
  countryCode: string;
  memberSince: string;
  city: string | null;
  activeListings: number;
  soldListings: number;
}

// ---------------------------------------------------------------- messagerie
export type MessageFlag = 'advance_payment' | 'money_transfer' | 'link' | 'code_request';
export interface ChatMessage {
  id: number; senderId: string; body: string; flags: MessageFlag[]; createdAt: string; failed?: boolean;
  // Offre de prix : 'offer' (la proposition), puis 'offer_accepted' / 'offer_declined' / 'offer_withdrawn'
  kind?: 'text' | 'offer' | 'offer_accepted' | 'offer_declined' | 'offer_withdrawn';
  offer?: { id: string; amountXaf: number; status: OfferStatus } | null;
}
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
export interface Person { id: string; displayName: string; verificationLevel: 'phone' | 'identity'; status: string }
export interface InboxItem {
  id: string; role: 'buyer' | 'seller';
  listing: { id: string; title: string; status: ListingStatus; thumbnailUrl: string | null };
  other: Person | null; lastMessagePreview: string | null; lastMessageAt: string; lastFromMe: boolean; unread: boolean;
}
export interface ConversationMeta {
  id: string; role: 'buyer' | 'seller';
  listing: { id: string; title: string; status: ListingStatus; priceType: PriceType; priceXaf: number | null; thumbnailUrl: string | null; parentSlug?: string | null; adType?: 'offer' | 'request' } | null;
  other: Person | null; iBlocked: boolean;
}
export interface ConversationPayload { conversation: ConversationMeta | null; otherLastReadAt: string | null; messages: ChatMessage[]; hasOlder: boolean }

/** Avis reçus par un utilisateur (1 à 5 étoiles). */
export interface Review { id: string; rating: number; comment: string | null; authorRole: 'buyer' | 'seller'; createdAt: string; authorName: string; listingTitle: string; listingParentSlug?: string | null }
export interface ReviewsPage { summary: { average: number | null; count: number; distribution?: Record<string, number> }; items: Review[]; nextCursor: string | null }

/** Quartier d'une ville (facultatif dans une annonce). */
export interface District { id: number; cityId: number; name: string; slug: string }
