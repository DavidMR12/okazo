import { sql } from 'drizzle-orm';
import { call, createTestApp, Ctx, login, loginAs, resetState, seedActiveListings, Session } from '../helpers';

describe('Avis et notes', () => {
  let ctx: Ctx;
  let seller: Session;
  let buyer: Session;
  let listing: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    [seller, buyer] = [await login(ctx), await login(ctx)];
    [listing] = await seedActiveListings(ctx, seller.userId, 1, { title: () => 'Samsung Galaxy A15' });
  });

  /** Une vraie conversation : l'acheteur écrit, le vendeur répond. `ageHours` vieillit l'échange. */
  const exchange = async (b = buyer, ageHours = 25) => {
    const start = await call(ctx, 'POST', '/conversations', { token: b.accessToken, body: { listingId: listing, body: 'Bonjour, toujours disponible ?' } });
    const id = start.body.conversationId as string;
    await call(ctx, 'POST', `/conversations/${id}/messages`, { token: seller.accessToken, body: { body: 'Oui, passez demain.' } });
    if (ageHours) await ctx.db.execute(sql`update messages set created_at = now() - make_interval(hours => ${ageHours}) where conversation_id = ${id}`);
    return id;
  };
  const review = (s: Session, conv: string, body: Record<string, unknown>) => call(ctx, 'POST', `/conversations/${conv}/review`, { token: s.accessToken, body });

  it('chacun note l’autre après un vrai échange ; la moyenne apparaît sur le profil et l’annonce', async () => {
    const conv = await exchange();
    const st = await call(ctx, 'GET', `/conversations/${conv}/review`, { token: buyer.accessToken });
    expect(st.body).toMatchObject({ canReview: true, reason: null, role: 'buyer', target: { id: seller.userId }, mine: null });

    const r = await review(buyer, conv, { rating: 5, comment: '  Vendeur sérieux,   téléphone conforme à l’annonce.  ' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ rating: 5, comment: 'Vendeur sérieux, téléphone conforme à l’annonce.', authorRole: 'buyer' });
    expect((await review(seller, conv, { rating: 4 })).status).toBe(201); // le vendeur note l'acheteur, sans commentaire

    // Un second acheteur, plus sévère
    const other = await login(ctx);
    await review(other, await exchange(other), { rating: 2, comment: 'Arrivé avec une heure de retard.' });

    const profile = (await call(ctx, 'GET', `/users/${seller.userId}`)).body;
    expect(profile).toMatchObject({ ratingAvg: 3.5, ratingCount: 2 });
    const detail = (await call(ctx, 'GET', `/listings/${listing}`)).body;
    expect(detail.seller).toMatchObject({ ratingAvg: 3.5, ratingCount: 2 });

    const list = (await call(ctx, 'GET', `/users/${seller.userId}/reviews`)).body;
    expect(list.summary).toMatchObject({ average: 3.5, count: 2, distribution: { '5': 1, '4': 0, '3': 0, '2': 1, '1': 0 } });
    expect(list.items.map((i: { rating: number }) => i.rating)).toEqual([2, 5]); // les plus récents d'abord
    expect(list.items[1]).toMatchObject({ listingTitle: 'Samsung Galaxy A15', authorRole: 'buyer' });

    // L'acheteur a reçu la note du vendeur
    expect((await call(ctx, 'GET', `/users/${buyer.userId}`)).body).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
  });

  it('pas d’avis sans échange réel, trop tôt, ou deux fois', async () => {
    // Seul l'acheteur a écrit
    const start = await call(ctx, 'POST', '/conversations', { token: buyer.accessToken, body: { listingId: listing, body: 'Bonjour ?' } });
    const lonely = start.body.conversationId as string;
    await ctx.db.execute(sql`update messages set created_at = now() - interval '3 days' where conversation_id = ${lonely}`);
    expect((await review(buyer, lonely, { rating: 1 })).body.code).toBe('NO_EXCHANGE');

    // Échange de moins de 24 h : il faut attendre, sauf si l'annonce est vendue
    await ctx.db.execute(sql`delete from conversations`);
    const fresh = await exchange(buyer, 0);
    const early = await review(buyer, fresh, { rating: 5 });
    expect(early.status).toBe(403);
    expect(early.body.code).toBe('TOO_EARLY');
    await ctx.db.execute(sql`update listings set status = 'sold' where id = ${listing}`);
    expect((await review(buyer, fresh, { rating: 5 })).status).toBe(201);

    const again = await review(buyer, fresh, { rating: 1 });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_REVIEWED');
    const st = (await call(ctx, 'GET', `/conversations/${fresh}/review`, { token: buyer.accessToken })).body;
    expect(st).toMatchObject({ canReview: false, reason: null, mine: { rating: 5 } });
  });

  it('refuse une note hors limites, un numéro ou un lien dans le commentaire, et les inconnus', async () => {
    const conv = await exchange();
    expect((await review(buyer, conv, { rating: 6 })).status).toBe(400);
    expect((await review(buyer, conv, { rating: 3, comment: 'Bof' })).status).toBe(400);
    expect((await review(buyer, conv, { rating: 3, comment: 'Appelez-moi plutôt au 6 77 12 34 56' })).body.code).toBe('REVIEW_CONTENT');
    expect((await review(buyer, conv, { rating: 3, comment: 'Meilleur prix sur www.arnaque.com' })).body.code).toBe('REVIEW_CONTENT');

    const stranger = await login(ctx);
    expect((await review(stranger, conv, { rating: 1 })).status).toBe(404);
    expect((await call(ctx, 'POST', `/conversations/${conv}/review`, { body: { rating: 1 } })).status).toBe(401);
  });

  it('un avis signalé et jugé fondé est masqué et ne compte plus dans la moyenne', async () => {
    const conv = await exchange();
    const { body: r } = await review(buyer, conv, { rating: 1, comment: 'Arnaqueur, ne venez pas, il ment sur tout.' });
    expect((await call(ctx, 'GET', `/users/${seller.userId}`)).body.ratingCount).toBe(1);

    const rep = await call(ctx, 'POST', `/reviews/${r.id}/report`, { token: seller.accessToken, body: { reason: 'fake_review', details: 'Cet acheteur n’est jamais venu.' } });
    expect(rep.status).toBe(201);
    expect((await call(ctx, 'POST', `/reviews/${r.id}/report`, { token: buyer.accessToken, body: { reason: 'harassment' } })).body.code).toBe('OWN_REVIEW');

    const mod = await loginAs(ctx, 'moderator');
    const open = (await call(ctx, 'GET', '/admin/reports', { token: mod.accessToken })).body.items;
    expect(open[0]).toMatchObject({ reviewId: r.id, reviewRating: 1, reviewComment: 'Arnaqueur, ne venez pas, il ment sur tout.', reportedUserId: buyer.userId });

    const res = await call(ctx, 'POST', `/admin/reports/${open[0].id}/resolve`, { token: mod.accessToken, body: { decision: 'uphold', removeListing: false } });
    expect(res.status).toBe(200);
    expect(res.body.reviewsHidden).toBe(1);

    expect((await call(ctx, 'GET', `/users/${seller.userId}`)).body).toMatchObject({ ratingAvg: null, ratingCount: 0 });
    expect((await call(ctx, 'GET', `/users/${seller.userId}/reviews`)).body.items).toHaveLength(0);
  });

  it('pagine les avis par curseur', async () => {
    for (let i = 0; i < 22; i++) {
      const b = await login(ctx);
      await review(b, await exchange(b), { rating: 4 });
    }
    const p1 = (await call(ctx, 'GET', `/users/${seller.userId}/reviews`)).body;
    expect(p1.items).toHaveLength(20);
    const p2 = (await call(ctx, 'GET', `/users/${seller.userId}/reviews?cursor=${p1.nextCursor}`)).body;
    expect(p2.items).toHaveLength(2);
    expect(p2.nextCursor).toBeNull();
    expect(new Set([...p1.items, ...p2.items].map((i: { id: string }) => i.id)).size).toBe(22);
  });
});
