import { z } from 'zod';
import { NAME_RE } from '../users/display-name';

// Le numéro doit être envoyé au format international (+237…, +241…, +242…).
const phone = z.string().trim().min(8).max(20);

// Canal du code : SMS (par défaut) ou WhatsApp
const channel = z.enum(['sms', 'whatsapp']).default('sms');
export const requestOtpSchema = z.object({ phone, channel });

export const verifyOtpSchema = z.object({
  phone,
  code: z.string().regex(/^\d{6}$/, 'Le code contient 6 chiffres.'),
  device: z.object({
    fingerprint: z.string().min(16).max(256),
    platform: z.enum(['ios', 'android', 'web']),
  }),
});

const device = z.object({
  fingerprint: z.string().min(16).max(256),
  platform: z.enum(['ios', 'android', 'web']),
});

/** Connexion avec Google (jeton d'identité) ou Facebook (jeton d'accès). */
export const oauthSchema = z.object({
  provider: z.enum(['google', 'facebook']),
  token: z.string().min(20).max(4096),
  device,
  country: z.string().length(2).transform((s) => s.toUpperCase()).default('CM'), // pays du compte créé
});
export const linkIdentitySchema = z.object({ provider: z.enum(['google', 'facebook']), token: z.string().min(20).max(4096) });
export const phoneRequestSchema = z.object({ phone, channel });
export const phoneVerifySchema = z.object({ phone, code: z.string().regex(/^\d{6}$/, 'Le code contient 6 chiffres.') });

// ---- E-mail et mot de passe (migration 015)
const email = z.string().trim().toLowerCase().email('Adresse e-mail invalide.').max(254);
// 8 caractères au moins, avec au moins une lettre et un chiffre
const password = z
  .string()
  .min(8, 'Le mot de passe contient au moins 8 caractères.')
  .max(128)
  .refine((p) => /\p{L}/u.test(p) && /\d/.test(p), 'Le mot de passe contient au moins une lettre et un chiffre.');
const code = z.string().regex(/^\d{6}$/, 'Le code contient 6 chiffres.');
export const emailRegisterSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(2).max(40).regex(NAME_RE, 'Caractères non autorisés dans le nom.'),
  country: z.string().length(2).transform((s) => s.toUpperCase()).default('CM'),
});
export const emailVerifySchema = z.object({ email, code, device });
export const emailLoginSchema = z.object({ email, password: z.string().min(1).max(128), device });
export const emailForgotSchema = z.object({ email });
export const emailResetSchema = z.object({ email, code, password, device });

// Acceptation des CGU : la version lue par l'utilisateur doit être celle en vigueur
export const acceptTermsSchema = z.object({ version: z.string().min(4).max(40), platform: z.enum(['ios', 'android', 'web']).optional() });

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type OAuthInput = z.infer<typeof oauthSchema>;
export type LinkIdentityInput = z.infer<typeof linkIdentitySchema>;
export type PhoneRequestInput = z.infer<typeof phoneRequestSchema>;
export type PhoneVerifyInput = z.infer<typeof phoneVerifySchema>;
export type EmailRegisterInput = z.infer<typeof emailRegisterSchema>;
export type EmailVerifyInput = z.infer<typeof emailVerifySchema>;
export type EmailLoginInput = z.infer<typeof emailLoginSchema>;
export type EmailForgotInput = z.infer<typeof emailForgotSchema>;
export type EmailResetInput = z.infer<typeof emailResetSchema>;
export type AcceptTermsInput = z.infer<typeof acceptTermsSchema>;
