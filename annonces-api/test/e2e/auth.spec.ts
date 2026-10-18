import { sql } from 'drizzle-orm';
import { call, createTestApp, Ctx, fingerprint, login, loginAs, nextPhone, resetState, rows } from '../helpers';

describe('Connexion par SMS et sessions', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
  });

  const verify = (phone: string, code: string, device = fingerprint()) =>
    call(ctx, 'POST', '/auth/otp/verify', { body: { phone, code, device: { fingerprint: device, platform: 'android' } } });

  // ---------------------------------------------------------------- code SMS
  describe('code SMS', () => {
    it('crée le compte au premier code valide, puis reconnecte le même compte', async () => {
      const phone = nextPhone();
      const req = await call(ctx, 'POST', '/auth/otp/request', { body: { phone } });
      expect(req.status).toBe(200);
      expect(req.body).toEqual({ expiresInSec: 300, resendAfterSec: 60, channel: 'sms' });
      expect(ctx.sms.messages[0].body).toMatch(/^Okazo : votre code est \d{6}\./);

      const first = await verify(phone, ctx.sms.lastCode(phone));
      expect(first.status).toBe(200);
      expect(first.body.isNewUser).toBe(true);
      expect(first.body.user.phone).toBe(phone);
      expect(first.body.user).not.toHaveProperty('trustScore'); // jamais exposé

      await ctx.redis.del(`rl:otp:cooldown:${phone}`);
      await call(ctx, 'POST', '/auth/otp/request', { body: { phone } });
      const second = await verify(phone, ctx.sms.lastCode(phone));
      expect(second.body.isNewUser).toBe(false);
      expect(second.body.user.id).toBe(first.body.user.id);

      const me = await call(ctx, 'GET', '/auth/me', { token: second.body.accessToken });
      expect(me.status).toBe(200);
      expect(me.body.id).toBe(first.body.user.id);
    });

    it('accepte un numéro saisi avec espaces et le normalise', async () => {
      const req = await call(ctx, 'POST', '/auth/otp/request', { body: { phone: '+237 6 71 23 45 67' } });
      expect(req.status).toBe(200);
      expect(ctx.sms.messages[0].to).toBe('+237671234567');
    });

    it('refuse un pays non ouvert et un numéro invalide', async () => {
      const fr = await call(ctx, 'POST', '/auth/otp/request', { body: { phone: '+33612345678' } });
      expect(fr.status).toBe(400);
      expect(fr.body.code).toBe('COUNTRY_NOT_SUPPORTED');

      const bad = await call(ctx, 'POST', '/auth/otp/request', { body: { phone: '+237123' } });
      expect(bad.status).toBe(400);
      expect(ctx.sms.messages).toHaveLength(0);
    });

    it('refuse un code incorrect', async () => {
      const phone = nextPhone();
      await call(ctx, 'POST', '/auth/otp/request', { body: { phone } });
      const good = ctx.sms.lastCode(phone);
      const wrong = good === '000000' ? '111111' : '000000';
      const res = await verify(phone, wrong);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CODE');
      // Le bon code reste utilisable après une erreur
      expect((await verify(phone, good)).status).toBe(200);
    });

    it('un code ne sert qu’une fois', async () => {
      const phone = nextPhone();
      await call(ctx, 'POST', '/auth/otp/request', { body: { phone } });
      const code = ctx.sms.lastCode(phone);
      expect((await verify(phone, code)).status).toBe(200);
      const again = await verify(phone, code);
      expect(again.status).toBe(400);
      expect(again.body.code).toBe('CODE_EXPIRED');
    });

    it('deux validations simultanées du même code : une seule réussit', async () => {
      const phone = nextPhone();
      await call(ctx, 'POST', '/auth/otp/request', { body: { phone } });
      const code = ctx.sms.lastCode(phone);
      const results = await Promise.all([verify(phone, code), verify(phone, code), verify(phone, code)]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      const [{ n }] = await rows<{ n: number }>(ctx, sql`select count(*)::int as n from users where phone_e164 = ${phone}`);
      expect(n).toBe(1);
    });

    it('invalide le code après 5 essais ratés, même si le bon arrive ensuite', async () => {
      const phone = nextPhone();
      await call(ctx, 'POST', '/auth/otp/request', { body: { phone } });
      const good = ctx.sms.lastCode(phone);
      const wrong = good === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) expect((await verify(phone, wrong)).body.code).toBe('INVALID_CODE');
      const sixth = await verify(phone, good);
      expect(sixth.status).toBe(429);
      expect(sixth.body.code).toBe('TOO_MANY_ATTEMPTS');
      expect((await verify(phone, good)).body.code).toBe('CODE_EXPIRED');
    });

    it('impose 60 s entre deux envois et 3 SMS par heure et par numéro', async () => {
      const phone = nextPhone();
      expect((await call(ctx, 'POST', '/auth/otp/request', { body: { phone } })).status).toBe(200);
      const tooSoon = await call(ctx, 'POST', '/auth/otp/request', { body: { phone } });
      expect(tooSoon.status).toBe(429);
      expect(tooSoon.body.code).toBe('RATE_LIMITED');
      expect(tooSoon.body.retryAfterSec).toBeGreaterThan(0);

      for (let i = 0; i < 2; i++) {
        await ctx.redis.del(`rl:otp:cooldown:${phone}`);
        expect((await call(ctx, 'POST', '/auth/otp/request', { body: { phone } })).status).toBe(200);
      }
      await ctx.redis.del(`rl:otp:cooldown:${phone}`);
      expect((await call(ctx, 'POST', '/auth/otp/request', { body: { phone } })).status).toBe(429);
      expect(ctx.sms.messages).toHaveLength(3);
    });

    it('limite les demandes par adresse IP (10 par heure)', async () => {
      for (let i = 0; i < 10; i++) {
        expect((await call(ctx, 'POST', '/auth/otp/request', { body: { phone: nextPhone() }, ip: '10.9.9.9' })).status).toBe(200);
      }
      const res = await call(ctx, 'POST', '/auth/otp/request', { body: { phone: nextPhone() }, ip: '10.9.9.9' });
      expect(res.status).toBe(429);
      // Une autre IP passe toujours
      expect((await call(ctx, 'POST', '/auth/otp/request', { body: { phone: nextPhone() }, ip: '10.9.9.10' })).status).toBe(200);
    });

    it('lit l’IP réelle derrière un relais de confiance, jamais celle annoncée par un client direct', async () => {
      const viaProxy = (clientIp: string) =>
        call(ctx, 'POST', '/auth/otp/request', { body: { phone: nextPhone() }, ip: '172.18.0.5', headers: { 'x-forwarded-for': clientIp } });
      // Derrière le relais : chaque visiteur a sa propre limite
      for (let i = 0; i < 10; i++) expect((await viaProxy('198.51.100.7')).status).toBe(200);
      expect((await viaProxy('198.51.100.7')).status).toBe(429);
      expect((await viaProxy('198.51.100.8')).status).toBe(200);

      // Client direct (adresse publique) : son X-Forwarded-For est ignoré, changer d'IP annoncée ne sert à rien
      const direct = (fake: string) =>
        call(ctx, 'POST', '/auth/otp/request', { body: { phone: nextPhone() }, ip: '203.0.113.9', headers: { 'x-forwarded-for': fake } });
      for (let i = 0; i < 10; i++) expect((await direct(`192.0.2.${i}`)).status).toBe(200);
      expect((await direct('192.0.2.99')).status).toBe(429);
    });

    it('n’enregistre pas de code si le SMS ne part pas', async () => {
      const phone = nextPhone();
      ctx.sms.fail = true;
      const res = await call(ctx, 'POST', '/auth/otp/request', { body: { phone } });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('SMS_SEND_FAILED');
      expect(await ctx.redis.exists(`otp:${phone}`)).toBe(0);
    });

    it('refuse un numéro ou un appareil bloqué', async () => {
      const phone = nextPhone();
      await ctx.db.execute(sql`insert into blocklist (kind, value, action) values ('phone', ${phone}, 'block')`);
      const res = await call(ctx, 'POST', '/auth/otp/request', { body: { phone } });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PHONE_BLOCKED');

      const s = await login(ctx, nextPhone(), fingerprint(42));
      const [{ hash }] = await rows<{ hash: string }>(ctx, sql`select fingerprint_hash as hash from devices where user_id = ${s.userId}`);
      await ctx.db.execute(sql`insert into blocklist (kind, value, action) values ('device', ${hash}, 'block')`);
      const other = nextPhone();
      await call(ctx, 'POST', '/auth/otp/request', { body: { phone: other } });
      const blocked = await verify(other, ctx.sms.lastCode(other), fingerprint(42));
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('DEVICE_BLOCKED');
    });

    it('un numéro « à surveiller » démarre avec des limites strictes', async () => {
      const phone = nextPhone();
      await ctx.db.execute(sql`insert into blocklist (kind, value, action) values ('phone', ${phone}, 'flag')`);
      const s = await login(ctx, phone);
      const [u] = await rows(ctx, sql`select trust_score, daily_listing_limit from users where id = ${s.userId}`);
      expect(u).toEqual({ trust_score: -20, daily_listing_limit: 1 });
    });

    it('valide le format des données envoyées', async () => {
      const res = await call(ctx, 'POST', '/auth/otp/verify', {
        body: { phone: nextPhone(), code: '12ab', device: { fingerprint: 'court', platform: 'windows' } },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual(['code', 'device.fingerprint', 'device.platform']);
    });
  });

  // ---------------------------------------------------------------- jetons
  describe('renouvellement de session', () => {
    it('renouvelle le jeton : l’ancien ne sert plus, le nouveau oui', async () => {
      const s = await login(ctx);
      const r1 = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
      expect(r1.status).toBe(200);
      expect(r1.body.refreshToken).not.toBe(s.refreshToken);
      expect((await call(ctx, 'GET', '/auth/me', { token: r1.body.accessToken })).status).toBe(200);

      const r2 = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: r1.body.refreshToken } });
      expect(r2.status).toBe(200);
    });

    it('réessai réseau récent avec l’ancien jeton : refusé, mais la session continue', async () => {
      const s = await login(ctx);
      const r1 = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
      const retry = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
      expect(retry.status).toBe(401);
      expect((await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: r1.body.refreshToken } })).status).toBe(200);
    });

    it('réutilisation tardive d’un ancien jeton (vol probable) : toutes les sessions sont coupées', async () => {
      const s = await login(ctx);
      const other = await login(ctx, s.phone, fingerprint(2)); // deuxième appareil
      const r1 = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });

      // L'ancien jeton a été remplacé il y a plus de 30 s
      await ctx.db.execute(sql`update refresh_tokens set revoked_at = now() - interval '1 minute' where revoked_at is not null`);
      const stolen = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
      expect(stolen.status).toBe(401);

      expect((await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: r1.body.refreshToken } })).status).toBe(401);
      expect((await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: other.refreshToken } })).status).toBe(401);
    });

    it('deux renouvellements simultanés du même jeton : un seul nouveau jeton émis', async () => {
      const s = await login(ctx);
      const results = await Promise.all(
        Array.from({ length: 4 }, () => call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } })),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      const [{ n }] = await rows<{ n: number }>(
        ctx,
        sql`select count(*)::int as n from refresh_tokens where user_id = ${s.userId} and revoked_at is null`,
      );
      expect(n).toBe(1);
    });

    it('refuse un jeton expiré ou inconnu', async () => {
      const s = await login(ctx);
      await ctx.db.execute(sql`update refresh_tokens set expires_at = now() - interval '1 second'`);
      expect((await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } })).status).toBe(401);
      expect((await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: 'x'.repeat(64) } })).status).toBe(401);
    });

    it('la déconnexion révoque le jeton', async () => {
      const s = await login(ctx);
      expect((await call(ctx, 'POST', '/auth/logout', { body: { refreshToken: s.refreshToken } })).status).toBe(204);
      expect((await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } })).status).toBe(401);
    });

    it('refuse les routes protégées sans jeton valide', async () => {
      expect((await call(ctx, 'GET', '/auth/me')).body.code).toBe('MISSING_TOKEN');
      expect((await call(ctx, 'GET', '/auth/me', { token: 'abc.def.ghi' })).body.code).toBe('INVALID_TOKEN');
    });
  });

  // ---------------------------------------------------------------- bannissement
  describe('bannissement', () => {
    it('coupe l’accès immédiatement et bloque numéro et appareil', async () => {
      const admin = await loginAs(ctx, 'admin');
      const target = await login(ctx, nextPhone(), fingerprint(7));

      const ban = await call(ctx, 'POST', '/admin/sanctions', {
        token: admin.accessToken,
        body: { userId: target.userId, type: 'ban', reason: 'Arnaques répétées' },
      });
      expect(ban.status).toBe(201);

      // Jeton d'accès encore valide en durée, mais refusé
      expect((await call(ctx, 'GET', '/auth/me', { token: target.accessToken })).body.code).toBe('ACCOUNT_DISABLED');
      expect((await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: target.refreshToken } })).status).toBe(401);

      // Le même numéro ne peut plus demander de code
      const again = await call(ctx, 'POST', '/auth/otp/request', { body: { phone: target.phone } });
      expect(again.body.code).toBe('PHONE_BLOCKED');

      // Le même appareil ne peut pas créer un autre compte
      const fresh = nextPhone();
      await call(ctx, 'POST', '/auth/otp/request', { body: { phone: fresh } });
      expect((await verify(fresh, ctx.sms.lastCode(fresh), fingerprint(7))).body.code).toBe('DEVICE_BLOCKED');
    });

    it('un modérateur ne peut pas bannir', async () => {
      const mod = await loginAs(ctx, 'moderator');
      const target = await login(ctx);
      const res = await call(ctx, 'POST', '/admin/sanctions', {
        token: mod.accessToken,
        body: { userId: target.userId, type: 'ban', reason: 'Arnaques répétées' },
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('BAN_REQUIRES_ADMIN');
    });

    it('un utilisateur simple n’a pas accès aux routes de modération', async () => {
      const s = await login(ctx);
      const res = await call(ctx, 'POST', '/admin/sanctions', {
        token: s.accessToken,
        body: { userId: s.userId, type: 'warning', reason: 'test' },
      });
      expect(res.status).toBe(403);
    });
  });
});
