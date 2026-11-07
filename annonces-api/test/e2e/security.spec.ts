import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { OAUTH_VERIFIER, OAuthVerifier } from '../../src/auth/oauth/oauth-verifier';
import { RulesService } from '../../src/moderation/rules.service';
import { acceptTerms, call, createListing, createTestApp, Ctx, fingerprint, login, loginAs, nextPhone, oauthToken, resetState, rows, seedActiveListings } from '../helpers';

describe('Audit de sécurité : failles corrigées', () => {
  let ctx: Ctx;
  const device = { fingerprint: fingerprint(9), platform: 'web' as const };
  const ip = '10.8.0.1';

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ctx.mail.messages = [];
  });

  const register = (displayName: string, email = 'nom@exemple.cm') =>
    call(ctx, 'POST', '/auth/email/register', { body: { email, password: 'Douala2026', displayName }, ip });

  const emailAccount = async (email = 'sans.numero@exemple.cm') => {
    expect((await register('Awa N.', email)).status).toBe(200);
    const v = await call(ctx, 'POST', '/auth/email/verify', { body: { email, code: ctx.mail.lastCode(email), device }, ip });
    expect(v.status).toBe(200);
    await acceptTerms(ctx, v.body.accessToken);
    return v.body as { accessToken: string; user: { id: string } };
  };

  describe('noms affichés', () => {
    it.each(['Support Okazo', 'Service client', 'Admin', 'Équipe sécurité'])('refuse « %s » à l’inscription', async (name) => {
      expect((await register(name)).body.code).toBe('NAME_RESERVED');
      expect(ctx.mail.messages).toEqual([]);
    });

    it('refuse un numéro de téléphone dans le nom', async () => {
      expect((await register('Awa 699001122')).body.code).toBe('NAME_HAS_PHONE');
    });

    it('ne reprend pas un nom réservé venu de Google', async () => {
      const profile = { provider: 'google' as const, subject: 'faux', name: 'Support Okazo', email: 'faux@exemple.com' };
      const oauth = ctx.app.get<OAuthVerifier>(OAUTH_VERIFIER, { strict: false });
      const spy = jest.spyOn(oauth, 'verify').mockResolvedValueOnce(profile);
      const res = await call(ctx, 'POST', '/auth/oauth', { body: { provider: 'google', token: oauthToken('google', 'faux'), device } });
      spy.mockRestore();
      expect(res.body.user.displayName).toBe('Utilisateur');
    });
  });

  describe('numéro vérifié', () => {
    it('ne peut pas être remplacé (session volée, contournement de sanction)', async () => {
      const s = await login(ctx);
      const other = nextPhone();
      const req = await call(ctx, 'POST', '/me/phone/request', { token: s.accessToken, body: { phone: other }, ip });
      expect(req.status).toBe(409);
      expect(req.body.code).toBe('PHONE_ALREADY_SET');
      const ver = await call(ctx, 'POST', '/me/phone/verify', { token: s.accessToken, body: { phone: other, code: '123456' } });
      expect(ver.body.code).toBe('PHONE_ALREADY_SET');
    });
  });

  describe('e-mail', () => {
    it('limite les inscriptions par IP avant de hacher le mot de passe', async () => {
      await ctx.redis.set(`rl:register:ip:${ip}`, '30', 'EX', 3600);
      const res = await register('Awa N.');
      expect(res.status).toBe(429);
    });

    it('mot de passe oublié : adresse connue ou non, même réponse à la 2e demande', async () => {
      await emailAccount('connue@exemple.cm');
      await ctx.redis.flushdb();
      const ask = (email: string) => call(ctx, 'POST', '/auth/email/forgot', { body: { email }, ip });
      const known = [await ask('connue@exemple.cm'), await ask('connue@exemple.cm')];
      const unknown = [await ask('inconnue@exemple.cm'), await ask('inconnue@exemple.cm')];
      expect(unknown.map((r) => [r.status, r.body.code])).toEqual(known.map((r) => [r.status, r.body.code]));
    });
  });

  describe('comptes suspendus et rôles', () => {
    const suspend = (id: string) => ctx.db.execute(sql`update users set status = 'suspended' where id = ${id}`);

    it('un compte suspendu ne récupère plus le numéro des vendeurs', async () => {
      const seller = await login(ctx);
      const [id] = await seedActiveListings(ctx, seller.userId, 1);
      const buyer = await login(ctx);
      await suspend(buyer.userId);
      const res = await call(ctx, 'GET', `/listings/${id}/contact`, { token: buyer.accessToken });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('USER_NOT_ACTIVE');
    });

    it('un modérateur suspendu perd l’accès à la modération', async () => {
      const mod = await loginAs(ctx, 'moderator');
      expect((await call(ctx, 'GET', '/admin/moderation/queue', { token: mod.accessToken })).status).toBe(200);
      await suspend(mod.userId);
      expect((await call(ctx, 'GET', '/admin/moderation/queue', { token: mod.accessToken })).status).toBe(403);
    });

    it('un retrait de rôle prend effet tout de suite, sans attendre la fin du jeton', async () => {
      const mod = await loginAs(ctx, 'moderator');
      await ctx.db.execute(sql`update users set role = 'user' where id = ${mod.userId}`);
      expect((await call(ctx, 'GET', '/admin/moderation/queue', { token: mod.accessToken })).status).toBe(403);
    });
  });

  describe('personne ne juge son propre dossier', () => {
    it('un modérateur n’approuve pas sa propre annonce', async () => {
      const mod = await loginAs(ctx, 'moderator');
      const id = await createListing(ctx, mod);
      await ctx.db.execute(sql`update listings set status = 'pending_review' where id = ${id}`);
      const res = await call(ctx, 'POST', `/admin/listings/${id}/approve`, { token: mod.accessToken, body: {} });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SELF_MODERATION');
    });

    it('un modérateur ne lève ni sa propre sanction, ni celle d’un admin', async () => {
      const mod = await loginAs(ctx, 'moderator');
      const admin = await loginAs(ctx, 'admin');
      const user = await login(ctx);
      const give = async (userId: string) =>
        (await call(ctx, 'POST', '/admin/sanctions', { token: admin.accessToken, body: { userId, type: 'warning', reason: 'Motif de test' } })).body;
      const onUser = await give(user.userId);
      const res = await call(ctx, 'POST', `/admin/sanctions/${onUser.id ?? onUser.sanction?.id}/revoke`, { token: mod.accessToken, body: {} });
      expect(res.body.code).toBe('REVOKE_REQUIRES_ADMIN');

      const [own] = await rows<{ id: string }>(
        ctx,
        sql`insert into sanctions (user_id, type, reason, issued_by) values (${mod.userId}, 'warning', 'Motif de test', ${admin.userId}) returning id`,
      );
      const self = await call(ctx, 'POST', `/admin/sanctions/${own.id}/revoke`, { token: mod.accessToken, body: {} });
      expect(self.body.code).toBe('SELF_SANCTION');
    });
  });

  describe('signalements', () => {
    it('trois comptes sans numéro ne retirent pas une annonce', async () => {
      const seller = await login(ctx);
      const [id] = await seedActiveListings(ctx, seller.userId, 1);
      for (let i = 0; i < 3; i++) {
        const r = (await login(ctx)).userId;
        await ctx.db.execute(sql`update users set phone_e164 = null where id = ${r}`);
        await ctx.db.execute(sql`insert into reports (reporter_id, listing_id, reason) values (${r}, ${id}, 'scam')`);
      }
      expect((await rows(ctx, sql`select status from listings where id = ${id}`))[0].status).toBe('active');
    });
  });

  describe('fichiers', () => {
    const pieces = async (bytes: Buffer) => {
      const s = await login(ctx);
      const keys = [`verifications/${s.userId}/${randomUUID()}.jpg`, `verifications/${s.userId}/${randomUUID()}.jpg`];
      for (const k of keys) ctx.storage.put(k, bytes, 'image/jpeg');
      return call(ctx, 'POST', '/verifications', { token: s.accessToken, body: { documentKind: 'id_card', documentKey: keys[0], selfieKey: keys[1] } });
    };

    it('refuse une « photo » de pièce d’identité qui n’en est pas une', async () => {
      expect((await pieces(Buffer.from('<script>alert(1)</script>'))).body.code).toBe('FILE_TYPE');
    });

    it('accepte une vraie photo JPEG', async () => {
      expect((await pieces(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).status).toBeLessThan(300);
    });
  });

  describe('annonces', () => {
    it('une annonce expirée ne donne plus le numéro du vendeur', async () => {
      const seller = await login(ctx);
      const buyer = await login(ctx);
      const [id] = await seedActiveListings(ctx, seller.userId, 1);
      await ctx.db.execute(sql`update listings set expires_at = now() - interval '1 day' where id = ${id}`);
      expect((await call(ctx, 'GET', `/listings/${id}/contact`, { token: buyer.accessToken })).status).toBe(404);
    });

    it('les champs de catégorie passent par les mots interdits', async () => {
      const rules = ctx.app.get(RulesService, { strict: false });
      const hits = (attributes: Record<string, unknown>) =>
        (rules as any).textRules({ title: 'Vélo', description: 'Bon état général', attributes, cityOther: null, districtOther: null });
      expect(JSON.stringify(await hits({ marque: 'Voir https://arnaque.example' }))).toContain('external_link');
      expect(await hits({ marque: 'Peugeot', annee: 2020 })).toEqual(await hits({}));
    });
  });

  describe('suppression d’un compte sans numéro', () => {
    it('le code part par e-mail et le compte est anonymisé', async () => {
      const s = await emailAccount();
      expect((await call(ctx, 'POST', '/me/delete/request', { token: s.accessToken, ip })).status).toBe(200);
      const code = ctx.mail.lastCode('sans.numero@exemple.cm');
      expect(ctx.mail.messages.at(-1)?.subject).toContain('suppression');
      expect((await call(ctx, 'DELETE', '/me', { token: s.accessToken, body: { code } })).status).toBe(204);
      expect((await rows(ctx, sql`select status from users where id = ${s.user.id}`))[0].status).toBe('deleted');
    });

    it('un compte Google sans numéro reçoit le code à l’adresse Google', async () => {
      const { body } = await call(ctx, 'POST', '/auth/oauth', { body: { provider: 'google', token: oauthToken('google', 'carine'), device } });
      expect((await call(ctx, 'POST', '/me/delete/request', { token: body.accessToken, ip })).status).toBe(200);
      expect(ctx.mail.lastCode('carine@exemple.com')).toMatch(/^\d{6}$/);
    });
  });

  it('une réponse sans en-tête de cache explicite n’est jamais mise en cache', async () => {
    const mod = await loginAs(ctx, 'moderator');
    const res = await ctx.app.inject({ method: 'GET', url: '/admin/moderation/queue', headers: { authorization: `Bearer ${mod.accessToken}` } });
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

});
