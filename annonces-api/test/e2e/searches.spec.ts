import { sql } from 'drizzle-orm';
import { call, categoryId, createTestApp, Ctx, login, Res, resetState, seedActiveListings, Session } from '../helpers';

describe('Recherche façon LeBonCoin', () => {
  let ctx: Ctx;
  let seller: Session;
  let buyer: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    [seller, buyer] = [await login(ctx), await login(ctx)];
  });

  const ids = async (q: string) => (await call(ctx, 'GET', `/listings?${q}`)).body.items.map((i: { id: string }) => i.id);

  describe('tri et pagination', () => {
    it('trie par prix croissant ou décroissant, page après page, sans doublon', async () => {
      const prices = [50000, 10000, 30000, 30000, 90000, 20000];
      const created = await seedActiveListings(ctx, seller.userId, prices.length);
      for (const [i, id] of created.entries()) await ctx.db.execute(sql`update listings set price_xaf = ${prices[i]} where id = ${id}`);
      // Une annonce « prix sur demande » : absente des tris par prix
      const [contact] = await seedActiveListings(ctx, seller.userId, 1);
      await ctx.db.execute(sql`update listings set price_type = 'contact', price_xaf = null where id = ${contact}`);

      const walk = async (sort: string) => {
        const seen: number[] = [];
        let cursor: string | null = null;
        do {
          const res: Res = await call(ctx, 'GET', `/listings?sort=${sort}&limit=2${cursor ? `&cursor=${cursor}` : ''}`);
          expect(res.status).toBe(200);
          expect(res.body.featured).toEqual([]);
          seen.push(...res.body.items.map((i: { priceXaf: number }) => i.priceXaf));
          cursor = res.body.nextCursor;
        } while (cursor);
        return seen;
      };
      expect(await walk('price_asc')).toEqual([10000, 20000, 30000, 30000, 50000, 90000]);
      expect(await walk('price_desc')).toEqual([90000, 50000, 30000, 30000, 20000, 10000]);
      expect((await ids('sort=recent')).length).toBe(7); // le tri par défaut garde tout
    });

    it('refuse un curseur d’un autre tri', async () => {
      await seedActiveListings(ctx, seller.userId, 3);
      const recent = await call(ctx, 'GET', '/listings?limit=1');
      const res = await call(ctx, 'GET', `/listings?sort=price_asc&cursor=${recent.body.nextCursor}`);
      expect(res.body.code).toBe('INVALID_CURSOR');
    });
  });

  describe('filtres et comptage', () => {
    it('filtre par état (plusieurs valeurs) et compte les résultats', async () => {
      const [a, b, c] = await seedActiveListings(ctx, seller.userId, 3);
      await ctx.db.execute(sql`update listings set condition = 'new' where id = ${a}`);
      await ctx.db.execute(sql`update listings set condition = 'like_new' where id = ${b}`);
      await ctx.db.execute(sql`update listings set condition = 'fair' where id = ${c}`);

      expect((await ids('condition=new,like_new')).sort()).toEqual([a, b].sort());
      expect((await ids('condition=nimporte'))).toHaveLength(3); // valeur inconnue : ignorée

      expect((await call(ctx, 'GET', '/listings/count')).body).toEqual({ count: 3 });
      expect((await call(ctx, 'GET', '/listings/count?condition=fair')).body).toEqual({ count: 1 });
      const phones = await categoryId(ctx, 'telephones');
      expect((await call(ctx, 'GET', `/listings/count?categoryId=${phones}&minPrice=10001`)).body).toEqual({ count: 2 });
    });
  });

  describe('recherches sauvegardées', () => {
    const save = (name: string, query: Record<string, unknown>, s = buyer) =>
      call(ctx, 'POST', '/me/searches', { token: s.accessToken, body: { name, query } });
    const mine = async (s = buyer) => (await call(ctx, 'GET', '/me/searches', { token: s.accessToken })).body.items;

    it('compte les nouvelles annonces depuis la dernière consultation', async () => {
      const cars = await categoryId(ctx, 'voitures');
      await ctx.db.execute(sql`update users set verification_level = 'identity' where id = ${seller.userId}`);
      const res = await save('Toyota à Douala', { categoryId: cars, a_brand: 'toyota', cursor: 'ignoré', limit: 5 });
      expect(res.status).toBe(201);
      expect(res.body.query).toEqual({ categoryId: cars, a_brand: 'toyota' }); // pagination jamais enregistrée

      // Dernière consultation il y a une heure ; puis deux Toyota et une Hyundai publiées
      await ctx.db.execute(sql`update saved_searches set last_seen_at = now() - interval '1 hour'`);
      const created = await seedActiveListings(ctx, seller.userId, 3, { category: 'voitures' });
      const brands = ['toyota', 'toyota', 'hyundai'];
      for (const [i, id] of created.entries()) {
        await ctx.db.execute(sql`update listings set attributes = ${JSON.stringify({ brand: brands[i], year: 2015 })}::jsonb where id = ${id}`);
      }
      expect((await mine())[0]).toMatchObject({ name: 'Toyota à Douala', newCount: 2 });

      // Consultation : les nouveautés repartent de zéro
      const id = (await mine())[0].id;
      expect((await call(ctx, 'POST', `/me/searches/${id}/seen`, { token: buyer.accessToken })).status).toBe(200);
      expect((await mine())[0].newCount).toBe(0);
    });

    it('chacun ne voit et ne modifie que ses recherches', async () => {
      const r = await save('Téléphones', { q: 'samsung' });
      expect(await mine(seller)).toEqual([]);
      expect((await call(ctx, 'POST', `/me/searches/${r.body.id}/seen`, { token: seller.accessToken })).status).toBe(404);
      await call(ctx, 'DELETE', `/me/searches/${r.body.id}`, { token: seller.accessToken });
      expect(await mine()).toHaveLength(1);
      expect((await call(ctx, 'DELETE', `/me/searches/${r.body.id}`, { token: buyer.accessToken })).status).toBe(204);
      expect(await mine()).toEqual([]);
    });

    it('refuse des filtres invalides et limite à 20 recherches', async () => {
      expect((await save('Mauvais', { minPrice: 'beaucoup' })).body.code).toBe('VALIDATION_ERROR');
      for (let i = 0; i < 20; i++) expect((await save(`Recherche ${i}`, { q: `objet ${i}` })).status).toBe(201);
      const over = await save('De trop', { q: 'encore' });
      expect(over.status).toBe(409);
      expect(over.body.code).toBe('SEARCHES_LIMIT');
    });

    it('exige une connexion', async () => {
      expect((await call(ctx, 'GET', '/me/searches')).status).toBe(401);
    });
  });
});
