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
    // Recherche par image : modèle CLIP exécuté sur le serveur (coupé pendant les tests)
    VISUAL_SEARCH_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
    MODEL_CACHE_DIR: z.string().min(1).default('.models'),
    REDIS_URL: z.string().url(),

    JWT_ACCESS_SECRET: z.string().min(32),
    OTP_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().default(900), // 15 min
    // Session sans fin pour l'utilisateur (demande du porteur, 20 octobre 2026) : 10 ans, repoussés à chaque renouvellement.
    // Elle ne s'arrête que par « Se déconnecter », la suppression du compte, un bannissement ou un vol détecté.
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(3650),

    OTP_TTL_SEC: z.coerce.number().int().default(300), // 5 min
    OTP_MAX_ATTEMPTS: z.coerce.number().int().default(5),
    OTP_PHONE_HOURLY_LIMIT: z.coerce.number().int().default(3),
    OTP_IP_HOURLY_LIMIT: z.coerce.number().int().default(10),
    OTP_DAILY_GLOBAL_CAP: z.coerce.number().int().default(5000), // plafond anti "SMS pumping"

    SMS_PROVIDER: z.enum(['console', 'twilio', 'infobip']).default('console'),
    INFOBIP_BASE_URL: z.string().regex(/^https:\/\/[a-z0-9-]+\.api\.infobip\.com$/, 'INFOBIP_BASE_URL : https://xxxxx.api.infobip.com, sans / final')
      .optional()
      .or(z.literal('').transform(() => undefined)), // compose passe une chaîne vide quand Infobip n'est pas configuré
    INFOBIP_API_KEY: z.string().optional(),
    INFOBIP_SENDER: z.string().max(11).default('Okazo'), // nom d'expéditeur (11 caractères au plus), à faire enregistrer par pays
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
    // Avant-première privée (site fermé par Cloudflare Access) : codes de connexion dans les journaux au lieu d'un SMS.
    // Seule exception tolérée en production ; à repasser à false avant l'ouverture au public.
    PREVIEW_MODE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
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
  // Pièces d'identité, CV et photos non modérées ne doivent jamais partager le bucket public
  .refine((e) => !(e.NODE_ENV === 'production' && (!e.S3_PRIVATE_BUCKET || e.S3_PRIVATE_BUCKET === e.S3_BUCKET)), {
    message: 'S3_PRIVATE_BUCKET doit être défini et différent de S3_BUCKET en production',
  })
  .refine((e) => !(e.NODE_ENV === 'production' && /localhost|127\.0\.0\.1|192\.168\./.test(e.CORS_ORIGINS)), {
    message: 'CORS_ORIGINS ne doit contenir que les vrais domaines en production',
  })
  .refine((e) => e.SMS_PROVIDER !== 'infobip' || (e.INFOBIP_BASE_URL && e.INFOBIP_API_KEY), {
    message: 'INFOBIP_BASE_URL et INFOBIP_API_KEY sont requis',
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.SMS_PROVIDER === 'console' && !e.PREVIEW_MODE), {
    message: 'SMS_PROVIDER=console est interdit en production (sauf PREVIEW_MODE=true, site fermé au public)',
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
