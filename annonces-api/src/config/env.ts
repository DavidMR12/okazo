import 'dotenv/config';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    // Relais dont on accepte l'en-tête X-Forwarded-For (Cloudflare Tunnel, site Next.js) : adresses, plages CIDR,
    // ou « loopback » / « uniquelocal » (réseaux privés, dont le réseau Docker). Un client qui joint l'API
    // depuis une autre adresse ne peut donc pas choisir son IP et contourner les limites anti-abus.
    TRUSTED_PROXIES: z.string().min(1).default('loopback,uniquelocal'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    JWT_ACCESS_SECRET: z.string().min(32),
    OTP_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().default(900), // 15 min
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),

    OTP_TTL_SEC: z.coerce.number().int().default(300), // 5 min
    OTP_MAX_ATTEMPTS: z.coerce.number().int().default(5),
    OTP_PHONE_HOURLY_LIMIT: z.coerce.number().int().default(3),
    OTP_IP_HOURLY_LIMIT: z.coerce.number().int().default(10),
    OTP_DAILY_GLOBAL_CAP: z.coerce.number().int().default(5000), // plafond anti "SMS pumping"

    SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM: z.string().optional(),

    // Code de connexion par WhatsApp (API WhatsApp Business Cloud de Meta). « none » : canal désactivé.
    WHATSAPP_PROVIDER: z.enum(['console', 'meta', 'none']).default('console'),
    // E-mails (connexion par e-mail) : console en développement ; fournisseur réel à choisir avant la bêta
    MAIL_PROVIDER: z.enum(['console', 'none']).default('console'),
    // Version en vigueur des CGU (page /conditions du site) : la changer oblige chacun à les accepter de nouveau
    TERMS_VERSION: z.string().default('2026-10-15'),
    WHATSAPP_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_TEMPLATE: z.string().default('code_verification'),
    WHATSAPP_TEMPLATE_LANG: z.string().default('fr'),

    // Connexion avec Google : identifiants clients OAuth (site, Android, iOS), séparés par des virgules
    GOOGLE_CLIENT_IDS: z.string().default('').transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
    // Connexion avec Facebook (application Meta Developers)
    FACEBOOK_APP_ID: z.string().optional(),
    FACEBOOK_APP_SECRET: z.string().optional(),

    CORS_ORIGINS: z.string().default('http://localhost:3001'),
    // Nom de la marque : SMS, protection contre l'usurpation. Seul endroit à changer côté API.
    APP_NAME: z.string().default('Okazo'),

    // Stockage des photos (Cloudflare R2 ou tout service compatible S3)
    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().min(1), // photos d'annonces (lecture publique)
    // Pièces d'identité et photos non modérées : jamais publiques. Vide = même bucket (développement)
    S3_PRIVATE_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    MEDIA_PUBLIC_BASE_URL: z.string().url(),
    MAX_IMAGE_BYTES: z.coerce.number().int().default(5_000_000),

    // Modération automatique
    MODERATION_TRUSTED_AFTER: z.coerce.number().int().default(3), // annonces approuvées avant de passer sans relecture
    MODERATION_PRICE_LOW_RATIO: z.coerce.number().default(0.3),
    MODERATION_CONCURRENCY: z.coerce.number().int().default(2),
    RUN_MODERATION_WORKER: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),

    CONTACT_DAILY_LIMIT: z.coerce.number().int().default(50), // numéros de vendeurs consultables par jour
    REPORTS_DAILY_LIMIT: z.coerce.number().int().default(20),
    FAVORITES_MAX: z.coerce.number().int().default(500),
    VERIFICATIONS_DAILY_LIMIT: z.coerce.number().int().default(3),
    RUN_MAINTENANCE_WORKER: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.WHATSAPP_PROVIDER === 'console'), {
    message: 'WHATSAPP_PROVIDER=console est interdit en production',
  })
  .refine((e) => e.WHATSAPP_PROVIDER !== 'meta' || (e.WHATSAPP_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID), {
    message: 'WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID sont requis',
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.MAIL_PROVIDER === 'console'), {
    message: 'MAIL_PROVIDER=console est interdit en production',
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.SMS_PROVIDER === 'console'), {
    message: "SMS_PROVIDER=console est interdit en production",
  })
  .refine(
    (e) =>
      e.SMS_PROVIDER !== 'twilio' || (e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_FROM),
    { message: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_FROM sont requis' },
  );

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuration invalide :', JSON.stringify(parsed.error.flatten(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
