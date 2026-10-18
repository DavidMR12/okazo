'use client';

import { createContext, useContext } from 'react';

export type Role = 'user' | 'moderator' | 'admin';
export interface AdminMe { id: string; displayName: string; role: Role }
export const AdminContext = createContext<AdminMe | null>(null);
export const useAdminMe = () => useContext(AdminContext);

export interface RuleHit { rule: string; severity?: 'reject' | 'review'; detail?: string }

/** Règles automatiques expliquées en français clair pour les modérateurs. */
const RULES: Record<string, string> = {
  keyword: 'Mot surveillé',
  domain: 'Site interdit',
  external_link: 'Lien externe dans le texte',
  price_too_low: 'Prix anormalement bas',
  duplicate_image: 'Photo déjà utilisée par un autre vendeur',
  image_from_banned_seller: "Photo d'un vendeur banni",
  image_hash: 'Photo connue comme frauduleuse',
  image_invalid: 'Photo illisible ou trop petite',
  duplicate_listing: 'Annonce en double du même vendeur',
  new_seller: 'Nouveau vendeur',
  low_trust: 'Score de confiance négatif',
  reports_threshold: 'Plusieurs signalements',
};

export function ruleLabel(h: RuleHit): string {
  const base = RULES[h.rule] ?? h.rule;
  return h.detail ? `${base} : ${h.detail}` : base;
}

export function asHits(v: unknown): RuleHit[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object' && 'rule' in x) as RuleHit[]) : [];
}

export const ACTION_LABELS: Record<string, string> = {
  auto_approve: 'Approuvée automatiquement',
  auto_reject: 'Refusée automatiquement',
  send_to_review: 'Envoyée en revue',
  approve: 'Approuvée',
  reject: 'Refusée',
  remove: 'Retirée',
  restore: 'Remise en ligne',
  request_changes: 'Modifications demandées',
};

export const REPORT_REASONS: Record<string, string> = {
  scam: 'Arnaque',
  fake_photos: 'Photos volées ou trompeuses',
  prohibited_item: 'Article interdit',
  duplicate: 'Doublon',
  wrong_category: 'Mauvaise catégorie',
  harassment: 'Harcèlement',
  fake_review: 'Faux avis',
  other: 'Autre',
};

/** Motifs de refus d'annonce : le message est montré au vendeur, sans révéler nos règles de détection. */
export const LISTING_REJECT_REASONS: { code: string; label: string; message: string }[] = [
  { code: 'PHOTOS_NOT_MATCHING', label: 'Photos non conformes', message: "Les photos ne correspondent pas à l'article ou proviennent d'Internet. Ajoutez vos propres photos." },
  { code: 'PROHIBITED', label: 'Article interdit', message: "Cet article n'est pas autorisé sur la plateforme." },
  { code: 'MISLEADING_PRICE', label: 'Prix trompeur', message: 'Le prix indiqué ne correspond pas à l’article. Indiquez le prix réel.' },
  { code: 'WRONG_CATEGORY', label: 'Mauvaise catégorie', message: "L'annonce n'est pas dans la bonne catégorie. Corrigez-la puis republiez." },
  { code: 'INCOMPLETE', label: 'Description insuffisante', message: 'La description est trop courte pour les acheteurs. Précisez l’état, les caractéristiques et les accessoires.' },
  { code: 'DUPLICATE', label: 'Doublon', message: 'Cette annonce existe déjà. Gardez une seule annonce par article.' },
  { code: 'SAFETY', label: 'Suspicion de fraude', message: 'Votre annonce ne respecte pas nos règles de sécurité.' },
  { code: 'OTHER', label: 'Autre (message libre)', message: '' },
];

export const IDENTITY_REJECT_REASONS = [
  'La photo de la pièce est floue ou illisible.',
  "La pièce n'est pas entière dans le cadre.",
  'Le visage du selfie ne correspond pas à la photo de la pièce.',
  "La pièce d'identité est expirée.",
  "Les captures d'écran et photos d'écran ne sont pas acceptées : photographiez la pièce elle-même.",
];

export const DOC_KINDS: Record<string, string> = {
  id_card: "Carte d'identité",
  passport: 'Passeport',
  driver_license: 'Permis de conduire',
};

export const STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  suspended: 'Suspendu',
  banned: 'Banni',
  deleted: 'Supprimé',
  pending_review: 'En vérification',
  rejected: 'Refusée',
  sold: 'Vendue',
  expired: 'Expirée',
  removed: 'Retirée',
  draft: 'Brouillon',
  open: 'Ouvert',
  reviewing: 'En cours',
  resolved: 'Fondé',
  dismissed: 'Classé sans suite',
};

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
