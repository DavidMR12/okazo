import { sql } from 'drizzle-orm';
import { call, createTestApp, Ctx, login, resetState, seedActiveListings, Session } from '../helpers';

describe('Faire une offre', () => {
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
    [listing] = await seedActiveListings(ctx, seller.userId, 1, { price: 200000 });
  });

  const offer = (amountXaf: number, s = buyer, message?: string, id = listing) =>
    call(ctx, 'POST', `/listings/${id}/offers`, { token: s.accessToken, body: { amountXaf, message } });
  const act = (id: string, action: 'accept' | 'decline' | 'withdraw', s: Session) => call(ctx, 'POST', `/offers/${id}/${action}`, { token: s.accessToken });
  const thread = async (conv: string, s = seller) => (await call(ctx, 'GET', `/conversations/${conv}`, { token: s.accessToken })).body.messages;

  it('l’offre ouvre la conversation, le vendeur l’accepte ; chaque étape est un message', async () => {
    const res = await offer(170000, buyer, 'Bonjour, je peux passer ce soir.');
    expect(res.status).toBe(201);
    const { offerId, conversationId } = res.body;

    let msgs = await thread(conversationId);
    expect(msgs.map((m: { kind: string }) => m.kind)).toEqual(['text', 'offer']);
    expect(msgs[1]).toMatchObject({ senderId: buyer.userId, body: 'Offre : 170 000 FCFA', offer: { id: offerId, amountXaf: 170000, status: 'pending' } });

    const inbox = (await call(ctx, 'GET', '/conversations', { token: seller.accessToken })).body.items;
    expect(inbox[0].lastMessagePreview).toBe('Offre : 170 000 FCFA');

    expect((await act(offerId, 'accept', buyer)).status).toBe(404); // l'acheteur n'accepte pas sa propre offre
    const ok = await act(offerId, 'accept', seller);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('accepted');

    msgs = await thread(conversationId, buyer);
    expect(msgs[2]).toMatchObject({ kind: 'offer_accepted', senderId: seller.userId, body: 'Offre de 170 000 FCFA acceptée.', offer: { id: offerId, status: 'accepted' } });
    expect(msgs[1].offer.status).toBe('accepted'); // la carte de l'offre se met à jour

    // Deuxième réponse impossible
    expect((await act(offerId, 'decline', seller)).body.code).toBe('OFFER_CLOSED');
  });

  it('une seule offre en attente ; après un refus ou un retrait, on peut en refaire une', async () => {
    const first = (await offer(150000)).body;
    expect((await offer(160000)).body.code).toBe('OFFER_PENDING');

    expect((await act(first.offerId, 'withdraw', seller)).status).toBe(404); // seul l'acheteur retire
    expect((await act(first.offerId, 'withdraw', buyer)).body.status).toBe('withdrawn');

    const second = (await offer(160000)).body;
    expect(second.conversationId).toBe(first.conversationId);
    expect((await act(second.offerId, 'decline', seller)).body.status).toBe('declined');
    expect((await offer(180000)).status).toBe(201);

    const kinds = (await thread(first.conversationId)).map((m: { kind: string }) => m.kind);
    expect(kinds).toEqual(['offer', 'offer_withdrawn', 'offer', 'offer_declined', 'offer']);
  });

  it('une offre sans réponse expire après 48 h et libère la place', async () => {
    const { offerId, conversationId } = (await offer(150000)).body;
    await ctx.db.execute(sql`update offers set created_at = now() - interval '49 hours' where id = ${offerId}`);

    expect((await thread(conversationId))[0].offer.status).toBe('expired');
    const late = await act(offerId, 'accept', seller);
    expect(late.status).toBe(409);
    expect(late.body.message).toContain('expiré');
    expect((await offer(160000)).status).toBe(201);
  });

  it('montant : inférieur au prix affiché et au moins 30 % de ce prix', async () => {
    expect((await offer(200000)).body.code).toBe('OFFER_TOO_HIGH');
    expect((await offer(59999)).body.code).toBe('OFFER_TOO_LOW');
    expect((await offer(60000)).status).toBe(201);
    expect((await offer(0)).status).toBe(400);
    expect((await offer(1500.5)).status).toBe(400);
  });

  it('pas d’offre sur sa propre annonce, une annonce gratuite, une offre d’emploi ou une demande', async () => {
    expect((await offer(150000, seller)).body.code).toBe('OWN_LISTING');

    await ctx.db.execute(sql`update listings set price_type = 'free', price_xaf = null where id = ${listing}`);
    expect((await offer(1000)).body.code).toBe('OFFER_NOT_ALLOWED');

    const [job] = await seedActiveListings(ctx, seller.userId, 1, { category: 'petits-boulots', price: 50000 });
    expect((await offer(40000, buyer, undefined, job)).body.code).toBe('OFFER_NOT_ALLOWED');

    const [wanted] = await seedActiveListings(ctx, seller.userId, 1, { price: 50000 });
    await ctx.db.execute(sql`update listings set ad_type = 'request' where id = ${wanted}`);
    expect((await offer(40000, buyer, undefined, wanted)).body.code).toBe('OFFER_NOT_ALLOWED');

    // Prix « sur demande » : pas de prix affiché, toute offre est possible
    const [onRequest] = await seedActiveListings(ctx, seller.userId, 1);
    await ctx.db.execute(sql`update listings set price_type = 'contact', price_xaf = null where id = ${onRequest}`);
    expect((await offer(5000, buyer, undefined, onRequest)).status).toBe(201);
  });

  it('accepter une offre sur une annonce qui n’est plus en ligne est refusé', async () => {
    const { offerId } = (await offer(150000)).body;
    await ctx.db.execute(sql`update listings set status = 'sold' where id = ${listing}`);
    expect((await act(offerId, 'accept', seller)).body.code).toBe('LISTING_NOT_ACTIVE');
  });
});
