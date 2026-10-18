import { z } from 'zod';

// Lettres (accents compris), chiffres, espaces, point, apostrophe, tiret
const NAME_RE = /^[\p{L}\p{M}0-9 .'’-]+$/u;

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .transform((s) => s.replace(/\s+/g, ' '))
      .pipe(z.string().min(2).max(60).regex(NAME_RE, 'Caractères non autorisés dans le nom.'))
      .optional(),
    cityId: z.number().int().positive().nullable().optional(),
    // « messages_only » : le numéro n'est jamais donné, les acheteurs passent par la messagerie
    contactPreference: z.enum(['all', 'messages_only']).optional(),
  })
  .refine((o) => o.displayName !== undefined || o.cityId !== undefined || o.contactPreference !== undefined, 'Aucune modification.');

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
