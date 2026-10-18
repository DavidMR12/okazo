export const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type ImageContentType = keyof typeof IMAGE_TYPES;

export const isAllowedImageType = (t: string | undefined): t is ImageContentType =>
  !!t && t in IMAGE_TYPES;

/** Dossier temporaire (privé) : photos envoyées par le vendeur, avant traitement. */
export const pendingKey = (userId: string, uuid: string, ext: string) => `pending/${userId}/${uuid}.${ext}`;

export const isPendingKeyOf = (userId: string, key: string): boolean =>
  new RegExp(`^pending/${userId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(key);

/**
 * Dossier public : photos traitées (WebP, sans métadonnées). Nommées par l'identifiant de la photo,
 * jamais par sa position : réordonner ou remplacer des photos ne peut pas écraser un fichier existant.
 */
export const fullKey = (listingId: string, imageId: string) => `listings/${listingId}/${imageId}-1200.webp`;

export const isProcessedKeyOf = (listingId: string, key: string): boolean =>
  new RegExp(`^listings/${listingId}/[0-9a-f-]{36}-1200\\.webp$`).test(key);
export const thumbKey = (full: string) => full.replace(/-1200\.webp$/, '-400.webp');

/** Dossier PRIVÉ (jamais public) : pièces d'identité et selfies. */
export const verificationKey = (userId: string, uuid: string, ext: string) => `verifications/${userId}/${uuid}.${ext}`;

export const isVerificationKeyOf = (userId: string, key: string): boolean =>
  new RegExp(`^verifications/${userId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(key);
