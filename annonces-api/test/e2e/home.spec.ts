import { sql } from 'drizzle-orm';
import { call, createTestApp, Ctx, login, resetState, seedActiveListings } from '../helpers';

describe('Accueil : catégories populaires', () => {
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

  it('classe les catégories principales par nombre d’annonces en ligne dans le pays', async () => {
    const seller = await login(ctx);
    await seedActiveListings(ctx, seller.userId, 3, { category: 'telephones' });
    await seedActiveListings(ctx, seller.userId, 1, { category: 'ordinateurs' });
    await seedActiveListings(ctx, seller.userId, 2, { category: 'petits-boulots' });
    const [gone] = await seedActiveListings(ctx, seller.userId, 1, { category: 'petits-boulots' });
    await ctx.db.execute(sql`update listings set status = 'sold' where id = ${gone}`); // plus en ligne : ne compte pas
    await seedActiveListings(ctx, seller.userId, 5, { category: 'telephones', city: 'libreville' }); // autre pays

    const res = await call(ctx, 'GET', '/categories/popular?country=cm');
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c: { slug: string; count: number }) => [c.slug, c.count])).toEqual([
      ['electronique', 4], // téléphones + ordinateurs, regroupés sous la catégorie principale
      ['emploi', 2],
    ]);
    expect(res.body.categories[0].imageUrl).toBeNull(); // annonces de test sans photo
    expect((await call(ctx, 'GET', '/categories/popular?country=cm&limit=1')).body.categories).toHaveLength(1);
    expect((await call(ctx, 'GET', '/categories/popular')).status).toBe(400);
  });
});
