import { z } from 'zod';

const attributes = z
  .record(z.unknown())
  .refine((a) => JSON.stringify(a).length <= 4000, 'Attributs trop volumineux.');

const price = z.number().int().positive().max(100_000_000_000);

// Je propose (vendre, recruter, offrir un service) / Je recherche (acheter, un emploi, un prestataire)
const adType = z.enum(['offer', 'request']);

// Portefeuilles électroniques acceptés par le vendeur (migration 016) ; ceux du pays de l'annonce seulement
export const WALLETS = ['mtn_momo', 'orange_money', 'airtel_money', 'moov_money', 'wave'] as const;
const paymentMethods = z.array(z.enum(WALLETS)).max(WALLETS.length);

// Ville ou quartier hors liste (migration 018) : lettres, espaces, tirets, apostrophes ; pas de chiffres
// (sinon un numéro de téléphone passerait par là sans modération).
const placeName = z
  .string()
  .trim()
  .min(2, 'Nom trop court.')
  .max(60, 'Nom trop long.')
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} '’.()-]*$/u, 'Lettres uniquement, sans chiffres.');

export const createListingSchema = z.object({
  adType: adType.default('offer'),
  categoryId: z.number().int().positive(),
  cityId: z.number().int().positive(),
  districtId: z.number().int().positive().nullable().optional(), // quartier de la ville, facultatif
  cityOther: placeName.nullable().optional(), // obligatoire avec la ville « Autres villes »
  districtOther: placeName.nullable().optional(), // quartier hors liste, sans districtId
  handDelivery: z.boolean().optional(), // remise en main propre (objets proposés seulement)
  paymentMethods: paymentMethods.default([]),
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(10).max(5000),
  priceType: z.enum(['fixed', 'negotiable', 'free', 'contact']),
  priceXaf: price.nullable().optional(),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'for_parts']).nullable().optional(),
  attributes: attributes.default({}),
  // Clés reçues de POST /media/upload-urls, une par photo, dans l'ordre d'affichage.
  // Facultatives pour l'emploi et les services : la règle dépend de la catégorie (voir ListingsService).
  imageKeys: z
    .array(z.string().min(10).max(200))
    .max(8)
    .refine((k) => new Set(k).size === k.length, 'Photos en double.')
    .default([]),
});

export const updateListingSchema = z
  .object({
    adType: adType.optional(),
    categoryId: z.number().int().positive().optional(),
    cityId: z.number().int().positive().optional(),
    districtId: z.number().int().positive().nullable().optional(), // null : retirer le quartier
    cityOther: placeName.nullable().optional(),
    districtOther: placeName.nullable().optional(),
    handDelivery: z.boolean().optional(),
    paymentMethods: paymentMethods.optional(),
    // Liste complète et ordonnée des photos : clés existantes (listings/…) à garder, et nouvelles clés (pending/…)
    photos: z
      .array(z.string().min(10).max(200))
      .max(8)
      .refine((k) => new Set(k).size === k.length, 'Photos en double.')
      .optional(),
    title: z.string().trim().min(5).max(120).optional(),
    description: z.string().trim().min(10).max(5000).optional(),
    priceType: z.enum(['fixed', 'negotiable', 'free', 'contact']).optional(),
    priceXaf: price.nullable().optional(),
    condition: z.enum(['new', 'like_new', 'good', 'fair', 'for_parts']).nullable().optional(),
    attributes: attributes.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Aucune modification.');

export const listQuerySchema = z.object({
  country: z.string().length(2).transform((s) => s.toUpperCase()).optional(),
  cityId: z.coerce.number().int().positive().optional(),
  districtId: z.coerce.number().int().positive().optional(),
  handDelivery: z.enum(['true', '1']).optional(), // seulement les annonces avec remise en main propre
  wallet: z.enum(WALLETS).optional(), // seulement les annonces qui acceptent ce portefeuille
  categoryId: z.coerce.number().int().positive().optional(),
  sellerId: z.string().uuid().optional(), // « les autres annonces de ce vendeur »
  adType: adType.optional(), // vide : offres et demandes
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().min(2).max(80).optional(),
  // État : une ou plusieurs valeurs séparées par des virgules (« new,like_new »)
  condition: z.string().max(100).optional(),
  // Tri : plus récentes (par défaut), prix croissant, prix décroissant
  sort: z.enum(['recent', 'price_asc', 'price_desc']).default('recent'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
})
  // Filtres des champs de la catégorie choisie : a_<champ>=valeur1,valeur2 ; a_<champ>_min / a_<champ>_max
  .catchall(z.string().max(200));

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
