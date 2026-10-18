import { z } from 'zod';
import { env } from '../config/env';

export const verificationUploadUrlsSchema = z.object({
  files: z
    .array(
      z.object({
        contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        sizeBytes: z.number().int().positive().max(env.MAX_IMAGE_BYTES),
      }),
    )
    .min(1)
    .max(2), // la pièce d'identité + le selfie
});

export const submitVerificationSchema = z
  .object({
    documentKind: z.enum(['id_card', 'passport', 'driver_license']),
    documentKey: z.string().min(10).max(200),
    selfieKey: z.string().min(10).max(200), // selfie en tenant la pièce d'identité à côté du visage
  })
  .refine((v) => v.documentKey !== v.selfieKey, 'Deux photos différentes sont nécessaires.');

export const reviewVerificationSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    rejectionReason: z.string().trim().min(5).max(300).optional(), // message affiché à l'utilisateur
  })
  .refine((r) => r.decision === 'approve' || r.rejectionReason, {
    message: 'Indiquez le motif du refus.',
    path: ['rejectionReason'],
  });

export const pendingQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type VerificationUploadUrlsInput = z.infer<typeof verificationUploadUrlsSchema>;
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;
export type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;
