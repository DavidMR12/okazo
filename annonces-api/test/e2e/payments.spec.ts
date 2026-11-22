import { sql } from 'drizzle-orm';
import { FakeGateway } from '../../src/payments/fake.gateway';
import { PAYMENT_GATEWAY } from '../../src/payments/payment-gateway';
import { PaymentsService } from '../../src/payments/payments.service';
import { call, createTestApp, Ctx, login, resetState, rows, seedActiveListings, Session } from '../helpers';

describe('Mise à la une payée (Mobile Money)', () => {
  let ctx: Ctx;
  let gateway: FakeGateway;
  let seller: Session;
  let other: Session;
  let listing: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    gateway = ctx.app.get(PAYMENT_GATEWAY);
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    gateway.next = 'completed';
    [seller, other] = [await login(ctx), await login(ctx)];
    [listing] = await seedActiveListings(ctx, seller.userId, 1);
  });

  const buy = (days: number, s = seller, id = listing) => call(ctx, 'POST', `/listings/${id}/boost`, { token: s.accessToken, body: { days } });
  const read = (id: string, s = seller) => call(ctx, 'GET', `/payments/${id}`, { token: s.accessToken });
  const boostUntil = async () => {
    const b = (await rows<{ b: string | null }>(ctx, sql`select boost_until as b from listings where id = ${listing}`))[0].b;
    return b ? new Date(b) : null;
  };

  it('affiche les offres et le pays couvert', async () => {
    const r = await call(ctx, 'GET', '/boosts/offers?country=cm');
    expect(r.body).toEqual({ enabled: true, offers: [{ days: 3, priceXaf: 1000 }, { days: 7, priceXaf: 2000 }, { days: 30, priceXaf: 5000 }] });
    expect((await call(ctx, 'GET', '/boosts/offers?country=FR')).body.enabled).toBe(false);
  });

  it('paiement réussi : annonce à la une pour la durée achetée, livrée une seule fois', async () => {
    const r = await buy(7);
    expect(r.status).toBe(201);
    expect(r.body.redirectUrl).toContain(`depositId=${r.body.paymentId}`);

    const p = await read(r.body.paymentId);
    expect(p.body).toMatchObject({ status: 'completed', amountXaf: 2000, days: 7 });
    const until = await boostUntil();
    const days = (until!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    // Notification en double, page relue, rattrapage : rien n'est ajouté une seconde fois
    await call(ctx, 'POST', '/payments/pawapay/callback', { body: { depositId: r.body.paymentId, status: 'COMPLETED' } });
    await read(r.body.paymentId);
    await ctx.app.get(PaymentsService).reconcile();
    expect((await boostUntil())!.getTime()).toBe(until!.getTime());

    // L'annonce apparaît « À la une » dans Mes annonces
    const mine = await call(ctx, 'GET', '/me/listings', { token: seller.accessToken });
    expect(mine.body.items[0].boostUntil).toBeTruthy();
  });

  it('un second achat prolonge la mise à la une en cours', async () => {
    await read((await buy(3)).body.paymentId);
    const first = (await boostUntil())!.getTime();
    await read((await buy(7)).body.paymentId);
    expect(((await boostUntil())!.getTime() - first) / 86_400_000).toBeCloseTo(7, 1);
  });

  it('paiement refusé : rien n’est livré, message clair', async () => {
    gateway.next = 'failed';
    const r = await buy(3);
    const p = await read(r.body.paymentId);
    expect(p.body).toMatchObject({ status: 'failed', message: 'Solde insuffisant sur votre compte Mobile Money.' });
    expect(await boostUntil()).toBeNull();
  });

  it('montant reçu différent du montant demandé : refusé', async () => {
    const r = await buy(30);
    gateway.set(r.body.paymentId, { state: 'completed', amountXaf: 100, currency: 'XAF', providerTxId: 'X' });
    expect((await read(r.body.paymentId)).body.status).toBe('failed');
    expect(await boostUntil()).toBeNull();
  });

  it('page de paiement abandonnée : en attente, puis expirée après 20 minutes', async () => {
    gateway.next = 'not_found';
    const r = await buy(3);
    expect((await read(r.body.paymentId)).body.status).toBe('pending');
    await ctx.db.execute(sql`update payments set created_at = now() - interval '25 minutes' where id = ${r.body.paymentId}`);
    await ctx.app.get(PaymentsService).reconcile();
    expect((await read(r.body.paymentId)).body.status).toBe('expired');
  });

  it('une fausse notification « COMPLETED » ne livre rien : le statut est relu chez le prestataire', async () => {
    gateway.next = 'pending';
    const r = await buy(7);
    await call(ctx, 'POST', '/payments/pawapay/callback', { body: { depositId: r.body.paymentId, status: 'COMPLETED', amount: '2000' } });
    await new Promise((ok) => setTimeout(ok, 50));
    expect((await read(r.body.paymentId)).body.status).toBe('pending');
    expect(await boostUntil()).toBeNull();
    // Notification sans contenu exploitable : toujours 200, sans effet
    expect((await call(ctx, 'POST', '/payments/pawapay/callback', { body: { depositId: 'x' } })).status).toBe(200);
  });

  it('refuse l’annonce d’un autre, une annonce hors ligne, une offre inconnue ; le paiement d’un autre est invisible', async () => {
    expect((await buy(7, other)).status).toBe(404);
    expect((await buy(5)).status).toBe(400);
    const r = await buy(3);
    expect((await read(r.body.paymentId, other)).status).toBe(404);
    await ctx.db.execute(sql`update listings set status = 'sold' where id = ${listing}`);
    expect((await buy(3)).status).toBe(403);
    expect((await call(ctx, 'POST', `/listings/${listing}/boost`, { body: { days: 3 } })).status).toBe(401);
  });
});
