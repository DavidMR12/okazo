import { acceptTerms, call, createListing, createTestApp, Ctx, fingerprint, login, resetState } from '../helpers';

describe('Connexion par e-mail et mot de passe', () => {
  let ctx: Ctx;
  const device = { fingerprint: fingerprint(7), platform: 'web' as const };
  const ip = '10.9.0.1';

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

  const register = async (email = 'awa@exemple.cm', password = 'Douala2026') => {
    const r = await call(ctx, 'POST', '/auth/email/register', { body: { email, password, displayName: 'Awa N.' }, ip });
    expect(r.status).toBe(200);
    const v = await call(ctx, 'POST', '/auth/email/verify', { body: { email, code: ctx.mail.lastCode(email.toLowerCase()), device }, ip });
    expect(v.status).toBe(200);
    await acceptTerms(ctx, v.body.accessToken); // CGU acceptées : seul le numéro manque
    return v.body;
  };

  it('inscription : code de confirmation, puis compte sans numéro (à vérifier pour agir)', async () => {
    const s = await register('Awa@Exemple.CM');
    expect(s.isNewUser).toBe(true);
    expect(s.phoneRequired).toBe(true);
    expect(s.user).toMatchObject({ email: 'awa@exemple.cm', phone: null, displayName: 'Awa N.' });
    expect(ctx.mail.messages[0].subject).toContain('confirmez votre adresse');

    // Comme pour Google : un numéro vérifié est exigé pour publier
    const res = await call(ctx, 'POST', '/listings', { token: s.accessToken, body: {} });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PHONE_REQUIRED');
  });

  it('refuse une adresse déjà utilisée, un mauvais code et un mot de passe trop simple', async () => {
    await register();
    const again = await call(ctx, 'POST', '/auth/email/register', { body: { email: 'AWA@exemple.cm', password: 'Autre2026x', displayName: 'Awa' }, ip });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('EMAIL_IN_USE');

    await call(ctx, 'POST', '/auth/email/register', { body: { email: 'paul@exemple.cm', password: 'Yaounde2026', displayName: 'Paul' }, ip });
    const bad = await call(ctx, 'POST', '/auth/email/verify', { body: { email: 'paul@exemple.cm', code: '000000', device }, ip });
    expect(bad.body.code).toBe(ctx.mail.lastCode('paul@exemple.cm') === '000000' ? undefined : 'INVALID_CODE');

    const weak = await call(ctx, 'POST', '/auth/email/register', { body: { email: 'eric@exemple.cm', password: 'motdepasse', displayName: 'Éric' }, ip });
    expect(weak.status).toBe(400);
  });

  it('connexion : bon mot de passe accepté, mauvais refusé sans dire lequel est faux', async () => {
    await register();
    const ok = await call(ctx, 'POST', '/auth/email/login', { body: { email: 'awa@exemple.cm', password: 'Douala2026', device }, ip });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('awa@exemple.cm');

    const wrong = await call(ctx, 'POST', '/auth/email/login', { body: { email: 'awa@exemple.cm', password: 'Faux12345', device }, ip });
    const unknown = await call(ctx, 'POST', '/auth/email/login', { body: { email: 'personne@exemple.cm', password: 'Faux12345', device }, ip });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body); // même message : on ne révèle pas quelles adresses ont un compte
  });

  it('limite les essais de mot de passe sur une même adresse', async () => {
    await register();
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await call(ctx, 'POST', '/auth/email/login', { body: { email: 'awa@exemple.cm', password: `Faux${i}2345`, device }, ip: `10.9.1.${i}` })).status;
    }
    expect(last).toBe(429);
  });

  it('mot de passe oublié : code par e-mail, nouveau mot de passe, anciennes sessions fermées', async () => {
    const first = await register();
    const unknown = await call(ctx, 'POST', '/auth/email/forgot', { body: { email: 'personne@exemple.cm' }, ip });
    const known = await call(ctx, 'POST', '/auth/email/forgot', { body: { email: 'awa@exemple.cm' }, ip });
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(ctx.mail.messages.some((m) => m.to === 'personne@exemple.cm')).toBe(false);

    const reset = await call(ctx, 'POST', '/auth/email/reset', {
      body: { email: 'awa@exemple.cm', code: ctx.mail.lastCode('awa@exemple.cm'), password: 'Nouveau2026', device },
      ip,
    });
    expect(reset.status).toBe(200);
    expect((await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: first.refreshToken } })).status).toBe(401);
    expect((await call(ctx, 'POST', '/auth/email/login', { body: { email: 'awa@exemple.cm', password: 'Douala2026', device }, ip })).status).toBe(401);
    expect((await call(ctx, 'POST', '/auth/email/login', { body: { email: 'awa@exemple.cm', password: 'Nouveau2026', device }, ip })).status).toBe(200);
  });

  it('un compte e-mail vérifie un numéro puis peut publier', async () => {
    const s = await register();
    const phone = '+237690112233';
    await call(ctx, 'POST', '/me/phone/request', { token: s.accessToken, body: { phone }, ip });
    const v = await call(ctx, 'POST', '/me/phone/verify', { token: s.accessToken, body: { phone, code: ctx.sms.lastCode(phone) } });
    expect(v.status).toBe(200);
    const id = await createListing(ctx, { userId: s.user.id, phone, accessToken: s.accessToken, refreshToken: s.refreshToken });
    expect(id).toBeTruthy();
    void login; // (le compte par téléphone reste possible à côté)
  });
});
