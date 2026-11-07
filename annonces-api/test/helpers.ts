import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { CategoriesService } from '../src/categories/categories.service';
import { SMS_PROVIDER, SmsProvider } from '../src/auth/sms/sms-provider';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from '../src/auth/whatsapp/whatsapp-provider';
import { MAIL_PROVIDER, MailProvider } from '../src/auth/mail/mail-provider';
import { OAUTH_VERIFIER, OAuthProfile, OAuthProvider, OAuthVerifier } from '../src/auth/oauth/oauth-verifier';
import { env } from '../src/config/env';
import { noStoreByDefault } from '../src/no-store';
import { Database, DB } from '../src/db/db.module';
import { StorageService } from '../src/media/storage.service';
import { REDIS } from '../src/redis/redis.module';

/** Remplace le fournisseur SMS : les messages sont gardés pour lire le code envoyé. */
export class SmsInbox implements SmsProvider {
  messages: { to: string; body: string }[] = [];
  fail = false;

  async send(to: string, body: string): Promise<void> {
    if (this.fail) throw new Error('panne simulée');
    this.messages.push({ to, body });
  }

  lastCode(to: string): string {
    const m = [...this.messages].reverse().find((x) => x.to === to);
    const code = m?.body.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`Aucun code envoyé à ${to}`);
    return code;
  }
}

/** Remplace l'envoi WhatsApp : les codes sont gardés pour être lus par les tests. */
export class WhatsAppInbox implements WhatsAppProvider {
  readonly enabled = true;
  codes: { to: string; code: string }[] = [];
  async sendCode(to: string, code: string): Promise<void> {
    this.codes.push({ to, code });
  }
  lastCode(to: string): string {
    const c = [...this.codes].reverse().find((x) => x.to === to);
    if (!c) throw new Error(`Aucun code WhatsApp envoyé à ${to}`);
    return c.code;
  }
}

/** Remplace l'envoi d'e-mails : les messages sont gardés pour lire le code envoyé. */
export class MailInbox implements MailProvider {
  readonly enabled = true;
  messages: { to: string; subject: string; text: string }[] = [];
  async send(to: string, subject: string, text: string): Promise<void> {
    this.messages.push({ to, subject, text });
  }
  lastCode(to: string): string {
    const m = [...this.messages].reverse().find((x) => x.to === to);
    const code = m?.text.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`Aucun code envoyé à ${to}`);
    return code;
  }
}

/** Google et Facebook simulés : un jeton « jeton-<fournisseur>-<identifiant> » est accepté, tout autre refusé. */
export class FakeOAuth implements OAuthVerifier {
  readonly enabled = { google: true, facebook: true };
  async verify(provider: OAuthProvider, token: string): Promise<OAuthProfile> {
    const m = token.match(/^jeton-(google|facebook)-([a-z0-9]+)-x+$/);
    if (!m || m[1] !== provider) throw new UnauthorizedException({ code: 'OAUTH_INVALID', message: 'Connexion refusée par le service. Réessayez.' });
    return { provider, subject: m[2], name: `Utilisateur ${m[2]}`, email: `${m[2]}@exemple.com` };
  }
}
export const oauthToken = (provider: OAuthProvider, subject: string) => `jeton-${provider}-${subject}-${'x'.repeat(12)}`;

/** Stockage S3 en mémoire (mêmes méthodes que StorageService). */
export class MemoryStorage {
  files = new Map<string, { body: Buffer; contentType: string }>();

  put(key: string, body: Buffer, contentType: string) {
    this.files.set(key, { body, contentType });
  }
  async presignUpload(key: string) {
    return `memory://upload/${key}`;
  }
  async presignDownload(key: string) {
    return `memory://download/${key}`;
  }
  async head(key: string) {
    const f = this.files.get(key);
    return f ? { size: f.body.length, contentType: f.contentType } : null;
  }
  async getBuffer(key: string) {
    const f = this.files.get(key);
    if (!f) throw new Error(`Fichier absent : ${key}`);
    return f.body;
  }
  async getPrefix(key: string, bytes = 16) {
    return (await this.getBuffer(key)).subarray(0, bytes);
  }
  async putBuffer(key: string, body: Buffer, contentType: string) {
    this.put(key, body, contentType);
  }
  async delete(key: string) {
    this.files.delete(key);
  }
  publicUrl(key: string) {
    return `${env.MEDIA_PUBLIC_BASE_URL}/${key}`;
  }
}

export interface Ctx {
  app: NestFastifyApplication;
  db: Database;
  redis: Redis;
  sms: SmsInbox;
  storage: MemoryStorage;
  whatsapp: WhatsAppInbox;
  mail: MailInbox;
}

export async function createTestApp(): Promise<Ctx> {
  const sms = new SmsInbox();
  const storage = new MemoryStorage();
  const whatsapp = new WhatsAppInbox();
  const mail = new MailInbox();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(sms)
    .overrideProvider(StorageService)
    .useValue(storage)
    .overrideProvider(WHATSAPP_PROVIDER)
    .useValue(whatsapp)
    .overrideProvider(OAUTH_VERIFIER)
    .useClass(FakeOAuth)
    .overrideProvider(MAIL_PROVIDER)
    .useValue(mail)
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ trustProxy: env.TRUSTED_PROXIES }),
    { logger: ['error'] },
  );
  noStoreByDefault(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, db: app.get(DB), redis: app.get(REDIS), sms, storage, whatsapp, mail };
}

let seedRules: { kind: string; value: string; action: string; reason: string | null }[] | null = null;

/** Vide les données de test (garde pays, villes, catégories et mots-clés initiaux) et Redis. */
export async function resetState(ctx: Ctx) {
  if (!seedRules) {
    seedRules = (await ctx.db.execute(
      sql`select kind::text, value, action::text, reason from blocklist where created_by is null and kind in ('keyword', 'domain')`,
    )) as unknown as typeof seedRules;
  }
  // CASCADE vide aussi blocklist (clé étrangère created_by) : les règles initiales sont recréées ensuite
  await ctx.db.transaction(async (tx) => {
    await tx.execute(sql`set local client_min_messages = warning`); // sans les avis « truncate cascades to… »
    await tx.execute(sql`truncate users, blocklist restart identity cascade`);
  });
  for (const r of seedRules!) {
    await ctx.db.execute(
      sql`insert into blocklist (kind, value, action, reason) values (${r.kind}::blocklist_kind, ${r.value}, ${r.action}::blocklist_action, ${r.reason})`,
    );
  }
  await ctx.redis.flushdb();
  ctx.sms.messages = [];
  ctx.sms.fail = false;
  ctx.storage.files.clear();
}

// ------------------------------------------------------------------ HTTP

export interface Res<T = any> {
  status: number;
  body: T;
}

export async function call<T = any>(
  ctx: Ctx,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  opts: { token?: string; body?: unknown; ip?: string; headers?: Record<string, string> } = {},
): Promise<Res<T>> {
  const res = await ctx.app.inject({
    method,
    url,
    payload: opts.body as any,
    headers: { ...opts.headers, ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    remoteAddress: opts.ip ?? '10.0.0.1',
  });
  return { status: res.statusCode, body: res.body ? res.json() : (undefined as T) };
}

// ------------------------------------------------------------------ comptes

let phoneSeq = 0;
/** Numéro mobile camerounais valide et unique (+237 67x xx xx xx). */
export const nextPhone = () => `+23767${String(++phoneSeq).padStart(7, '0')}`;
export const fingerprint = (n = 1) => `appareil-de-test-${String(n).padStart(4, '0')}`;

export interface Session {
  userId: string;
  phone: string;
  accessToken: string;
  refreshToken: string;
}

export async function login(ctx: Ctx, phone = nextPhone(), device = fingerprint()): Promise<Session> {
  const ip = `10.1.${phoneSeq % 250}.${Math.floor(Math.random() * 250)}`;
  await ctx.redis.del(`rl:otp:cooldown:${phone}`); // reconnexion d'un même numéro dans le test
  const req = await call(ctx, 'POST', '/auth/otp/request', { body: { phone }, ip });
  if (req.status !== 200) throw new Error(`otp/request ${req.status} ${JSON.stringify(req.body)}`);
  const res = await call(ctx, 'POST', '/auth/otp/verify', {
    body: { phone, code: ctx.sms.lastCode(phone), device: { fingerprint: device, platform: 'android' } },
    ip,
  });
  if (res.status !== 200) throw new Error(`otp/verify ${res.status} ${JSON.stringify(res.body)}`);
  await acceptTerms(ctx, res.body.accessToken);
  return { userId: res.body.user.id, phone, accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

/** Accepte la version en vigueur des CGU (exigée avant de publier, contacter, écrire…). */
export async function acceptTerms(ctx: Ctx, token: string) {
  const r = await call(ctx, 'POST', '/me/terms', { token, body: { version: env.TERMS_VERSION, platform: 'android' } });
  if (r.status !== 200) throw new Error(`me/terms ${r.status} ${JSON.stringify(r.body)}`);
}

/** Donne un rôle puis reconnecte. */
export async function loginAs(ctx: Ctx, role: 'moderator' | 'admin'): Promise<Session> {
  const s = await login(ctx);
  await ctx.db.execute(sql`update users set role = ${role}::user_role where id = ${s.userId}`);
  return login(ctx, s.phone);
}

// ------------------------------------------------------------------ référentiel

export async function categoryId(ctx: Ctx, slug: string): Promise<number> {
  const [r] = (await ctx.db.execute(sql`select id from categories where slug = ${slug}`)) as unknown as { id: number }[];
  return r.id;
}

export async function cityId(ctx: Ctx, slug: string): Promise<number> {
  const [r] = (await ctx.db.execute(sql`select id from cities where slug = ${slug}`)) as unknown as { id: number }[];
  return r.id;
}

// ------------------------------------------------------------------ photos et annonces

/**
 * Photo JPEG synthétique « réaliste » (dégradé et formes douces), différente pour chaque graine.
 * Un motif à haute fréquence ne conviendrait pas : la moindre recompression changerait son empreinte.
 */
export async function makeImage(seed: number, width = 640, height = 480): Promise<Buffer> {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const color = () => `hsl(${Math.floor(rnd() * 360)},${40 + Math.floor(rnd() * 50)}%,${25 + Math.floor(rnd() * 50)}%)`;
  const shapes = Array.from({ length: 8 }, () =>
    rnd() < 0.5
      ? `<circle cx="${rnd() * width}" cy="${rnd() * height}" r="${30 + rnd() * width * 0.25}" fill="${color()}"/>`
      : `<rect x="${rnd() * width}" y="${rnd() * height}" width="${40 + rnd() * width * 0.4}" height="${40 + rnd() * height * 0.4}" fill="${color()}"/>`,
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x2="${rnd()}" y2="1"><stop offset="0" stop-color="${color()}"/><stop offset="1" stop-color="${color()}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>${shapes}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

/** Comme un client : demande des URL d'envoi puis « envoie » les fichiers. */
export async function uploadPhotos(ctx: Ctx, s: Session, images: Buffer[]): Promise<string[]> {
  const res = await call(ctx, 'POST', '/media/upload-urls', {
    token: s.accessToken,
    body: { files: images.map((b) => ({ contentType: 'image/jpeg', sizeBytes: b.length })) },
  });
  if (res.status !== 200) throw new Error(`upload-urls ${res.status} ${JSON.stringify(res.body)}`);
  const keys: string[] = res.body.uploads.map((u: { key: string }) => u.key);
  keys.forEach((k, i) => ctx.storage.put(k, images[i], 'image/jpeg'));
  return keys;
}

let imageSeed = 0;

/** Valeurs valides pour les champs obligatoires d'une catégorie (lues dans son vrai formulaire). */
export async function requiredAttributes(ctx: Ctx, catId: number): Promise<Record<string, string | number>> {
  const form = await ctx.app.get(CategoriesService).formFor(catId);
  const out: Record<string, string | number> = {};
  for (const f of form.fields.filter((x) => x.required)) {
    out[f.key] = f.type === 'select' ? f.options[0].value : f.type === 'number' ? (f.min ?? 1) : 'Exemple';
  }
  return out;
}

export async function listingBody(ctx: Ctx, s: Session, overrides: Record<string, unknown> = {}) {
  const catId = (overrides.categoryId as number | undefined) ?? (await categoryId(ctx, 'telephones'));
  return {
    categoryId: catId,
    attributes: await requiredAttributes(ctx, catId),
    cityId: await cityId(ctx, 'douala'),
    title: 'Téléphone Samsung A54',
    description: 'Très bon état, vendu avec chargeur et facture.',
    priceType: 'fixed',
    priceXaf: 150000,
    condition: 'good',
    imageKeys: await uploadPhotos(ctx, s, [await makeImage(++imageSeed)]),
    ...overrides,
  };
}

export async function createListing(ctx: Ctx, s: Session, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await call(ctx, 'POST', '/listings', { token: s.accessToken, body: await listingBody(ctx, s, overrides) });
  if (res.status !== 201) throw new Error(`POST /listings ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}

/** Met une annonce en ligne sans passer par la modération (le déclencheur fixe les dates). */
export async function activate(ctx: Ctx, listingId: string) {
  await ctx.db.execute(sql`update listings set status = 'active' where id = ${listingId}`);
}

export async function rows<T = any>(ctx: Ctx, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await ctx.db.execute(query)) as unknown as T[];
}

/**
 * Annonces en ligne créées directement en base (plus rapide que l'API, sans limite quotidienne).
 * `publishedAt` identique pour toutes : utile pour vérifier le départage par identifiant.
 */
export async function seedActiveListings(
  ctx: Ctx,
  userId: string,
  n: number,
  opts: { category?: string; city?: string; price?: number; publishedAt?: string; title?: (i: number) => string } = {},
): Promise<string[]> {
  const cat = await categoryId(ctx, opts.category ?? 'telephones');
  const city = await cityId(ctx, opts.city ?? 'douala');
  await ctx.db.execute(sql`update users set daily_listing_limit = 1000 where id = ${userId}`);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const [r] = await rows<{ id: string }>(
      ctx,
      sql`insert into listings (user_id, category_id, country_code, city_id, title, description, price_type, price_xaf)
          select ${userId}, ${cat}, c.country_code, c.id, ${opts.title?.(i) ?? `Annonce numéro ${i}`}, 'Description de test assez longue.', 'fixed', ${opts.price ?? 10000 + i}
            from cities c where c.id = ${city}
          returning id`,
    );
    await ctx.db.execute(
      sql`update listings set status = 'active', published_at = coalesce(${opts.publishedAt ?? null}::timestamptz, now()) where id = ${r.id}`,
    );
    ids.push(r.id);
  }
  return ids;
}
