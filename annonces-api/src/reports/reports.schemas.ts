import { z } from 'zod';
import { sanctionInputSchema } from '../sanctions/sanctions.schemas';

export const createReportSchema = z
  .object({
    listingId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    reason: z.enum(['scam', 'fake_photos', 'prohibited_item', 'duplicate', 'wrong_category', 'harassment', 'other']),
    details: z.string().trim().max(1000).optional(),
  })
  .refine((r) => !!r.listingId !== !!r.userId, 'Indiquez une annonce ou un utilisateur (pas les deux).')
  .refine((r) => r.reason !== 'other' || (r.details?.length ?? 0) >= 10, {
    message: 'Précisez le problème en quelques mots.',
    path: ['details'],
  });

export const adminReportsQuery = z.object({
  status: z.enum(['open', 'resolved', 'dismissed']).default('open'), // "open" inclut "reviewing"
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

export const resolveReportSchema = z
  .object({
    decision: z.enum(['uphold', 'dismiss']), // uphold = signalement fondé
    removeListing: z.boolean().default(true),
    blockImages: z.boolean().default(false), // ajoute les photos à la liste noire (refus automatique si réutilisées)
    sanction: sanctionInputSchema.optional(), // appliquée au vendeur / à l'utilisateur signalé
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.decision === 'uphold' || (!d.sanction && !d.blockImages), {
    message: 'Un signalement rejeté ne peut pas entraîner de sanction ni de blocage.',
  });

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type AdminReportsQuery = z.infer<typeof adminReportsQuery>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
