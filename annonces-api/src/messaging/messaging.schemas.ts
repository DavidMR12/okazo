import { z } from 'zod';

const body = z
  .string()
  .transform((s) => s.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim())
  .pipe(z.string().min(1, 'Message vide.').max(2000, 'Message trop long (2 000 caractères maximum).'));

export const startConversationSchema = z.object({ listingId: z.string().uuid(), body });
export const sendMessageSchema = z.object({ body });
export const conversationQuery = z.object({
  after: z.coerce.number().int().positive().optional(), // nouveaux messages (relevé régulier)
  before: z.coerce.number().int().positive().optional(), // messages plus anciens (défilement vers le haut)
});
export const inboxQuery = z.object({ cursor: z.string().max(200).optional() });
export const reportConversationSchema = z
  .object({
    reason: z.enum(['scam', 'harassment', 'other']),
    details: z.string().trim().max(1000).optional(),
  })
  .refine((r) => r.reason !== 'other' || (r.details?.length ?? 0) >= 10, { message: 'Précisez le problème.', path: ['details'] });

export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ConversationQuery = z.infer<typeof conversationQuery>;
export type ReportConversationInput = z.infer<typeof reportConversationSchema>;
