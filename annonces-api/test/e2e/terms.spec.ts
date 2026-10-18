import { sql } from 'drizzle-orm';
import { env } from '../../src/config/env';
import { call, createTestApp, Ctx, fingerprint, login, resetState } from '../helpers';

describe('Acceptation des conditions d’utilisation (preuve)', () => {
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

  // Connexion SANS accepter les CGU (le helper login les accepte)
  const freshSession = async (phone = '+237690554433') => {
    await call(ctx, 'POST', '/auth/otp/request', { body: { phone } });
    const v = await call(ctx, 'POST', '/auth/otp/verify', { body: { phone, code: ctx.sms.lastCode(phone), device: { fingerprint: fingerprint(9), platform: 'web' } } });
    return v.body as { accessToken: string; user: { id: string; termsAccepted: boolean; termsVersion: string } };
  };

  it('un nouveau compte n’a pas accepté les CGU : il ne peut ni publier ni écrire', async () => {
    const s = await freshSession();
    expect(s.user.termsAccepted).toBe(false);
    expect(s.user.termsVersion).toBe(env.TERMS_VERSION);
    // Les gardes passent avant la validation : un corps vide suffit à vérifier le refus
    const res = await call(ctx, 'POST', '/listings', { token: s.accessToken, body: {} });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TERMS_REQUIRED');
  });

  it('l’acceptation est enregistrée (version, date, IP, appareil) et débloque les actions', async () => {
    const s = await freshSession();
    const r = await call(ctx, 'POST', '/me/terms', { token: s.accessToken, body: { version: env.TERMS_VERSION, platform: 'web' }, ip: '10.20.30.40' });
    expect(r.status).toBe(200);
    expect(r.body.termsAccepted).toBe(true);
    const rows = (await ctx.db.execute(sql`select version, host(ip) as ip, platform from terms_acceptances where user_id = ${s.user.id}`)) as unknown as { version: string; ip: string; platform: string }[];
    expect(rows).toEqual([{ version: env.TERMS_VERSION, ip: '10.20.30.40', platform: 'web' }]);
    expect((await call(ctx, 'GET', '/auth/me', { token: s.accessToken })).body.termsAccepted).toBe(true);
  });

  it('refuse une ancienne version, et une nouvelle version des CGU doit être acceptée de nouveau', async () => {
    const s = await freshSession();
    expect((await call(ctx, 'POST', '/me/terms', { token: s.accessToken, body: { version: '2020-01-01' } })).body.code).toBe('TERMS_OUTDATED');

    const seller = await login(ctx); // a accepté la version en vigueur
    await ctx.db.execute(sql`update users set terms_version = '2025-01-01' where id = ${seller.userId}`); // CGU changées depuis
    const res = await call(ctx, 'POST', '/listings', { token: seller.accessToken, body: {} });
    expect(res.body.code).toBe('TERMS_REQUIRED');
  });
});
