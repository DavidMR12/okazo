import { activate, call, createListing, createTestApp, Ctx, login, resetState, Session } from '../helpers';

describe('Remise en main propre', () => {
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

  it('proposée par défaut pour un objet, refusable, et sert de filtre', async () => {
    const yes = await createListing(ctx, seller, { title: 'Téléphone remis en main propre' });
    const no = await createListing(ctx, seller, { title: 'Téléphone sans remise', handDelivery: false });
    await activate(ctx, yes);
    await activate(ctx, no);

    expect((await call(ctx, 'GET', `/listings/${yes}`)).body.handDelivery).toBe(true);
    expect((await call(ctx, 'GET', `/listings/${no}`)).body.handDelivery).toBe(false);
    const filtered = (await call(ctx, 'GET', '/listings?handDelivery=true')).body.items;
    expect(filtered.map((i: { id: string }) => i.id)).toEqual([yes]);
    expect((await call(ctx, 'GET', '/listings/count?handDelivery=true')).body.count).toBe(1);
  });

  it('sans objet pour une demande (« Je recherche »)', async () => {
    const id = await createListing(ctx, seller, { adType: 'request', handDelivery: true });
    await activate(ctx, id);
    expect((await call(ctx, 'GET', `/listings/${id}`)).body.handDelivery).toBeNull();
  });

  it('modifier : retirer puis remettre la remise en main propre', async () => {
    const id = await createListing(ctx, seller);
    await activate(ctx, id);
    const edit = (body: Record<string, unknown>) => call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body });
    const mine = async () => (await call(ctx, 'GET', `/me/listings/${id}`, { token: seller.accessToken })).body;

    expect((await edit({ handDelivery: false })).status).toBe(200);
    expect((await mine()).handDelivery).toBe(false);
    await activate(ctx, id);
    expect((await edit({ title: 'Nouveau titre de l’annonce' })).status).toBe(200);
    expect((await mine()).handDelivery).toBe(false); // gardé quand on modifie autre chose
    await activate(ctx, id);
    await edit({ handDelivery: true });
    expect((await mine()).handDelivery).toBe(true);
  });
});
