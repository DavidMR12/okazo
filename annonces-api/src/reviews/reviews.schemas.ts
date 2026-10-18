import { z } from 'zod';

export const createReviewSchema = z.object({
  rating: z.number().int().min(1, 'Choisissez une note de 1 à 5 étoiles.').max(5, 'Choisissez une note de 1 à 5 étoiles.'),
  comment: z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(500, 'Avis trop long (500 caractères maximum).'))
    .transform((s) => s || undefined)
    .pipe(z.string().min(10, 'Écrivez au moins 10 caractères, ou laissez le commentaire vide.').optional())
    .optional(),
});

export const reportReviewSchema = z
  .object({
    reason: z.enum(['fake_review', 'harassment', 'other']),
    details: z.string().trim().max(1000).optional(),
  })
  .refine((r) => r.reason !== 'other' || (r.details?.length ?? 0) >= 10, { message: 'Précisez le problème en quelques mots.', path: ['details'] });

export const reviewsQuery = z.object({ cursor: z.string().max(200).optional() });

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ReportReviewInput = z.infer<typeof reportReviewSchema>;
