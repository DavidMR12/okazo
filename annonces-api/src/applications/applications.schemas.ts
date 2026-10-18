import { z } from 'zod';

/** CV : PDF, ou photo du CV (beaucoup de candidats n'ont pas de PDF). 5 Mo au plus. */
export const CV_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' } as const;
export type CvContentType = keyof typeof CV_TYPES;
export const CV_MAX_BYTES = 5_000_000;

export const cvUploadSchema = z.object({
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  sizeBytes: z.number().int().positive().max(CV_MAX_BYTES, 'CV trop volumineux (5 Mo maximum).'),
});

export const applySchema = z.object({
  message: z
    .string()
    .transform((s) => s.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim())
    .pipe(z.string().min(20, 'Présentez-vous en quelques phrases (20 caractères au moins).').max(2000, 'Message trop long (2 000 caractères maximum).')),
  cvKey: z.string().min(10).max(200).optional(),
});

export const statusSchema = z.object({ status: z.enum(['shortlisted', 'rejected', 'viewed']) });
export const mineQuery = z.object({ listingId: z.string().uuid().optional() });

export type CvUploadInput = z.infer<typeof cvUploadSchema>;
export type ApplyInput = z.infer<typeof applySchema>;
export type EmployerStatus = z.infer<typeof statusSchema>['status'];
