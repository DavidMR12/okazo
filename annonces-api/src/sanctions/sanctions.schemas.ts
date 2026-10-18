import { z } from 'zod';

export const sanctionInputSchema = z
  .object({
    type: z.enum(['warning', 'suspension', 'ban']),
    reason: z.string().trim().min(3).max(500),
    durationDays: z.number().int().min(1).max(365).optional(),
  })
  .refine((s) => s.type !== 'suspension' || s.durationDays, {
    message: 'Indiquez la durée de la suspension.',
    path: ['durationDays'],
  });

export const issueSanctionSchema = sanctionInputSchema.and(z.object({ userId: z.string().uuid() }));

export type SanctionInput = z.infer<typeof sanctionInputSchema>;
export type IssueSanctionInput = z.infer<typeof issueSanctionSchema>;
