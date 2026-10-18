import { activate, call, cityId, createListing, createTestApp, Ctx, login, resetState, Session } from '../helpers';

describe('Portefeuilles électroniques acceptés', () => {
  let ctx: Ctx;
  let seller: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    seller = await login(ctx);
  });

  it('chaque pays a ses portefeuilles', async () => {
    const res = await call(ctx, 'GET', '/geo/countries');
    const by = Object.fromEntries(res.body.countries.map((c: { code: string; wallets: string[] }) => [c.code, c.wallets]));
    expect(by.CM).toEqual(['mtn_momo', 'orange_money']);
    expect(by.GA).toEqual(['airtel_money', 'moov_money']);
    expect(by.CG).toEqual(['mtn_momo', 'airtel_money']);
  });

  it('enregistre les portefeuilles du pays, ignore les autres, et sert de filtre', async () => {
    // Annonce à Douala (Cameroun) : Airtel Money n'existe pas au Cameroun, il est ignoré
    const momo = await createListing(ctx, seller, { title: 'Téléphone payable par MoMo', paymentMethods: ['mtn_momo', 'airtel_money'] });
    const none = await createListing(ctx, seller, { title: 'Téléphone sans portefeuille' });
    await activate(ctx, momo);
    await activate(ctx, none);
    expect((await call(ctx, 'GET', `/listings/${momo}`)).body.paymentMethods).toEqual(['mtn_momo']);
    expect((await call(ctx, 'GET', `/listings/${none}`)).body.paymentMethods).toEqual([]);

    const filtered = (await call(ctx, 'GET', '/listings?wallet=mtn_momo')).body.items.map((i: { id: string }) => i.id);
    expect(filtered).toEqual([momo]);
    expect((await call(ctx, 'GET', '/listings/count?wallet=orange_money')).body.count).toBe(0);
    expect((await call(ctx, 'GET', '/listings?wallet=bitcoin')).status).toBe(400);
  });

  it('pas de portefeuille pour une demande ; modifier : changer, et changer de pays retire ceux qui n’y existent pas', async () => {
    const req = await createListing(ctx, seller, { adType: 'request', paymentMethods: ['mtn_momo'] });
    await activate(ctx, req);
    expect((await call(ctx, 'GET', `/listings/${req}`)).body.paymentMethods).toEqual([]);

    const id = await createListing(ctx, seller, { paymentMethods: ['mtn_momo', 'orange_money'] });
    await activate(ctx, id);
    const edit = (body: Record<string, unknown>) => call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body });
    const mine = async () => (await call(ctx, 'GET', `/me/listings/${id}`, { token: seller.accessToken })).body;

    expect((await edit({ paymentMethods: ['orange_money'] })).status).toBe(200);
    expect((await mine()).paymentMethods).toEqual(['orange_money']);

    await activate(ctx, id);
    const libreville = await cityId(ctx, 'libreville').catch(() => null);
    if (libreville) {
      expect((await edit({ cityId: libreville })).status).toBe(200);
      expect((await mine()).paymentMethods).toEqual([]); // Orange Money n'est pas proposé au Gabon
    }
  });
});
