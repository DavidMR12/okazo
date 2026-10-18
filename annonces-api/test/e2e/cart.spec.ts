import { sql } from 'drizzle-orm';
import { call, createTestApp, Ctx, login, resetState, rows, seedActiveListings, Session } from '../helpers';

describe('Panier (liste d’achats, sans paiement)', () => {
  let ctx: Ctx;
  let buyer: Session;
  let sellerA: Session;
  let sellerB: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    [buyer, sellerA, sellerB] = [await login(ctx), await login(ctx), await login(ctx)];
  });

  const add = (id: string, s = buyer) => call(ctx, 'PUT', `/cart/${id}`, { token: s.accessToken });
  const cart = async () => (await call(ctx, 'GET', '/me/cart', { token: buyer.accessToken })).body;

  it('regroupe les articles par vendeur, avec le total des articles disponibles', async () => {
    const [a1, a2] = await seedActiveListings(ctx, sellerA.userId, 2, { price: 10000 });
    const [b1] = await seedActiveListings(ctx, sellerB.userId, 1, { price: 25000 });
    await ctx.db.execute(sql`update users set display_name = 'Vendeur A' where id = ${sellerA.userId}`);
    for (const id of [a1, b1, a2]) expect((await add(id)).status).toBe(200);
    expect((await add(a1)).status).toBe(200); // idempotent

    const c = await cart();
    expect(c.count).toBe(3);
    expect(c.total).toBe(10000 + 10000 + 25000);
    expect(c.sellers).toHaveLength(2);
    expect(c.sellers[0].seller).toMatchObject({ id: sellerA.userId, displayName: 'Vendeur A' });
    expect(c.sellers[0].items.map((i: { id: string }) => i.id)).toEqual([a1, a2]);
    expect(c.sellers[0].total).toBe(20000);

    const ids = (await call(ctx, 'GET', '/me/cart/ids', { token: buyer.accessToken })).body.ids;
    expect(ids.sort()).toEqual([a1, a2, b1].sort());

    expect((await call(ctx, 'DELETE', `/cart/${a2}`, { token: buyer.accessToken })).status).toBe(204);
    expect((await cart()).count).toBe(2);
  });

  it('refuse sa propre annonce, une demande et une offre d’emploi', async () => {
    const [own] = await seedActiveListings(ctx, buyer.userId, 1);
    expect((await add(own)).body.code).toBe('OWN_LISTING');

    const [request] = await seedActiveListings(ctx, sellerA.userId, 1);
    await ctx.db.execute(sql`update listings set ad_type = 'request' where id = ${request}`);
    expect((await add(request)).body.code).toBe('NOT_PURCHASABLE');

    await ctx.db.execute(sql`update users set verification_level = 'identity' where id = ${sellerA.userId}`);
    const [job] = await seedActiveListings(ctx, sellerA.userId, 1, { category: 'offres-emploi' });
    expect((await add(job)).body.code).toBe('NOT_PURCHASABLE');

    // Un service, lui, peut être ajouté
    const [lesson] = await seedActiveListings(ctx, sellerA.userId, 1, { category: 'cours-particuliers' });
    expect((await add(lesson)).status).toBe(200);
  });

  it('article vendu : affiché grisé et sorti du total ; annonce retirée : masquée', async () => {
    const [sold, removed, ok] = await seedActiveListings(ctx, sellerA.userId, 3, { price: 10000 });
    for (const id of [sold, removed, ok]) await add(id);
    await ctx.db.execute(sql`update listings set status = 'sold' where id = ${sold}`);
    await ctx.db.execute(sql`update listings set status = 'removed' where id = ${removed}`);

    const c = await cart();
    const items = c.sellers[0].items;
    expect(items.map((i: { id: string }) => i.id)).toEqual([sold, ok]);
    expect(items.find((i: { id: string }) => i.id === sold).available).toBe(false);
    expect(c.total).toBe(10000); // seul l'article encore disponible compte
  });

  it('une annonce plus disponible ne peut pas être ajoutée', async () => {
    const [id] = await seedActiveListings(ctx, sellerA.userId, 1);
    await ctx.db.execute(sql`update listings set status = 'sold' where id = ${id}`);
    expect((await add(id)).status).toBe(404);
  });

  it('limité à 50 articles', async () => {
    const ids = await seedActiveListings(ctx, sellerA.userId, 51);
    for (const id of ids.slice(0, 50)) await ctx.db.execute(sql`insert into cart_items (user_id, listing_id) values (${buyer.userId}, ${id})`);
    const res = await add(ids[50]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CART_LIMIT');
  });

  it('le panier est vidé à la suppression du compte', async () => {
    const [id] = await seedActiveListings(ctx, sellerA.userId, 1);
    await add(id);
    await ctx.redis.del(`rl:otp:cooldown:${buyer.phone}`); // code de connexion envoyé il y a moins de 60 s
    await call(ctx, 'POST', '/me/delete/request', { token: buyer.accessToken });
    await call(ctx, 'DELETE', '/me', { token: buyer.accessToken, body: { code: ctx.sms.lastCode(buyer.phone) } });
    expect(await rows(ctx, sql`select 1 from cart_items where user_id = ${buyer.userId}`)).toEqual([]);
  });
});
