import { sql } from 'drizzle-orm';
import { acceptTerms, call, createTestApp, Ctx, fingerprint, login, nextPhone, oauthToken, resetState, rows, seedActiveListings } from '../helpers';

describe('Connexion avec Google, Facebook ou un code WhatsApp', () => {
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

  const device = { fingerprint: fingerprint(7), platform: 'android' as const };
  const oauth = (provider: 'google' | 'facebook', subject: string, extra: Record<string, unknown> = {}) =>
    call(ctx, 'POST', '/auth/oauth', { body: { provider, token: oauthToken(provider, subject), device, ...extra } });

  it('annonce les modes de connexion disponibles', async () => {
    const res = await call(ctx, 'GET', '/auth/methods');
    expect(res.body).toEqual({ otpChannels: ['sms', 'whatsapp'], google: true, facebook: false, email: true }); // Facebook retiré des écrans
  });

  it('code par WhatsApp : même vérification que par SMS', async () => {
    const phone = nextPhone();
    const req = await call(ctx, 'POST', '/auth/otp/request', { body: { phone, channel: 'whatsapp' } });
    expect(req.status).toBe(200);
    expect(req.body.channel).toBe('whatsapp');
    expect(ctx.sms.messages).toHaveLength(0); // aucun SMS envoyé
    const res = await call(ctx, 'POST', '/auth/otp/verify', { body: { phone, code: ctx.whatsapp.lastCode(phone), device } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isNewUser: true, phoneRequired: false });
  });

  it('Google crée un compte sans numéro ; le numéro est exigé pour agir, pas pour parcourir', async () => {
    const res = await oauth('google', 'alice', { country: 'ga' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isNewUser: true, phoneRequired: true, user: { phone: null, displayName: 'Utilisateur alice', countryCode: 'GA' } });
    const token = res.body.accessToken as string;

    // Parcourir et garder des favoris : oui
    const seller = await login(ctx);
    const [listing] = await seedActiveListings(ctx, seller.userId, 1);
    expect((await call(ctx, 'PUT', `/favorites/${listing}`, { token })).status).toBe(200);
    // Agir : non, tant que le numéro n'est pas vérifié (CGU acceptées : elles sont vérifiées avant le numéro)
    await acceptTerms(ctx, token);
    for (const r of [
      call(ctx, 'POST', '/conversations', { token, body: { listingId: listing, body: 'Bonjour' } }),
      call(ctx, 'GET', `/listings/${listing}/contact`, { token }),
      call(ctx, 'POST', `/listings/${listing}/offers`, { token, body: { amountXaf: 9000 } }),
    ]) {
      const out = await r;
      expect(out.status).toBe(403);
      expect(out.body.code).toBe('PHONE_REQUIRED');
    }

    // Vérifier un numéro (ici par WhatsApp) débloque les actions
    const phone = nextPhone();
    expect((await call(ctx, 'POST', '/me/phone/request', { token, body: { phone, channel: 'whatsapp' } })).status).toBe(200);
    const v = await call(ctx, 'POST', '/me/phone/verify', { token, body: { phone, code: ctx.whatsapp.lastCode(phone) } });
    expect(v.status).toBe(200);
    expect(v.body.phone).toBe(phone);
    expect((await call(ctx, 'POST', '/conversations', { token, body: { listingId: listing, body: 'Bonjour' } })).status).toBe(201);

    // Se reconnecter avec Google retrouve le même compte, numéro compris
    const again = await oauth('google', 'alice');
    expect(again.body).toMatchObject({ isNewUser: false, phoneRequired: false, user: { id: res.body.user.id, phone } });
    expect((await call(ctx, 'GET', '/auth/me', { token })).body.identities).toEqual(['google']);
  });

  it('un numéro déjà utilisé par un autre compte est refusé', async () => {
    const existing = await login(ctx);
    const { body } = await oauth('facebook', 'bob');
    const res = await call(ctx, 'POST', '/me/phone/request', { token: body.accessToken, body: { phone: existing.phone } });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_IN_USE');
  });

  it('associer et dissocier Google depuis un compte à numéro', async () => {
    const s = await login(ctx);
    const link = await call(ctx, 'POST', '/me/identities', { token: s.accessToken, body: { provider: 'google', token: oauthToken('google', 'carla') } });
    expect(link.status).toBe(200);
    expect(link.body.identities).toEqual(['google']);
    // Google mène désormais à ce compte
    expect((await oauth('google', 'carla')).body.user.id).toBe(s.userId);
    // Déjà lié à un autre utilisateur : refusé
    const other = await login(ctx);
    expect((await call(ctx, 'POST', '/me/identities', { token: other.accessToken, body: { provider: 'google', token: oauthToken('google', 'carla') } })).body.code).toBe('IDENTITY_IN_USE');
    expect((await call(ctx, 'DELETE', '/me/identities/google', { token: s.accessToken })).body.identities).toEqual([]);
  });

  it('on ne retire pas le dernier moyen de connexion d’un compte sans numéro', async () => {
    const { body } = await oauth('google', 'dave');
    const res = await call(ctx, 'DELETE', '/me/identities/google', { token: body.accessToken });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LAST_LOGIN_METHOD');
  });

  it('jeton invalide ou compte banni : refusé', async () => {
    const bad = await call(ctx, 'POST', '/auth/oauth', { body: { provider: 'google', token: 'jeton-facebook-eve-xxxxxxxxxxxx', device } });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('OAUTH_INVALID');

    const { body } = await oauth('google', 'eve');
    await ctx.db.execute(sql`update users set status = 'banned' where id = ${body.user.id}`);
    const res = await oauth('google', 'eve');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_BANNED');
  });

  it('supprimer son compte retire les comptes liés', async () => {
    const s = await login(ctx);
    await call(ctx, 'POST', '/me/identities', { token: s.accessToken, body: { provider: 'facebook', token: oauthToken('facebook', 'fanny') } });
    await ctx.redis.del(`rl:otp:cooldown:${s.phone}`);
    await call(ctx, 'POST', '/me/delete/request', { token: s.accessToken });
    expect((await call(ctx, 'DELETE', '/me', { token: s.accessToken, body: { code: ctx.sms.lastCode(s.phone) } })).status).toBe(204);
    expect(await rows(ctx, sql`select 1 from user_identities where user_id = ${s.userId}`)).toHaveLength(0);
    // Le même compte Facebook peut repartir de zéro
    expect((await oauth('facebook', 'fanny')).body.isNewUser).toBe(true);
  });
});
