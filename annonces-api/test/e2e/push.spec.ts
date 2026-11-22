import { sql } from 'drizzle-orm';
import { call, createTestApp, Ctx, login, loginAs, resetState, rows, seedActiveListings, Session } from '../helpers';

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
// Jetons Firebase factices (même forme que les vrais, ~160 caractères)
const T1 = `fcm1:${'a'.repeat(150)}`;
const T2 = `fcm2:${'b'.repeat(150)}`;

describe('Notifications push', () => {
  let ctx: Ctx;
  let seller: Session;
  let buyer: Session;
  let listing: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await wait(1800); // laisse partir les notifications différées avant de fermer la base
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    [seller, buyer] = [await login(ctx), await login(ctx)];
    [listing] = await seedActiveListings(ctx, seller.userId, 1, { title: () => 'Vélo de course rouge' });
  });

  const register = (s: Session, token: string, platform = 'android') =>
    call(ctx, 'POST', '/me/push-tokens', { token: s.accessToken, body: { token, platform } });
  const tokensOf = async (userId: string) =>
    (await rows<{ token: string }>(ctx, sql`select token from push_tokens where user_id = ${userId}`)).map((r) => r.token);

  it('enregistre, refuse un jeton mal formé, retire à la déconnexion', async () => {
    expect((await register(seller, T1)).status).toBe(204);
    expect((await register(seller, 'pas-un-jeton')).status).toBe(400);
    expect((await call(ctx, 'POST', '/me/push-tokens', { body: { token: T1, platform: 'android' } })).status).toBe(401);
    expect(await tokensOf(seller.userId)).toEqual([T1]);
    // Retirer le jeton d'un autre compte : sans effet
    expect((await call(ctx, 'POST', '/me/push-tokens/remove', { token: buyer.accessToken, body: { token: T1 } })).status).toBe(204);
    expect(await tokensOf(seller.userId)).toEqual([T1]);
    await call(ctx, 'POST', '/me/push-tokens/remove', { token: seller.accessToken, body: { token: T1 } });
    expect(await tokensOf(seller.userId)).toEqual([]);
  });

  it('un autre compte connecté sur le même téléphone reprend le jeton', async () => {
    await register(seller, T1);
    await register(buyer, T1);
    expect(await tokensOf(seller.userId)).toEqual([]);
    expect(await tokensOf(buyer.userId)).toEqual([T1]);
  });

  it('nouveau message : le vendeur est prévenu, sans le contenu, une seule fois par minute', async () => {
    await register(seller, T1);
    await register(buyer, T2);
    const r = await call(ctx, 'POST', '/conversations', { token: buyer.accessToken, body: { listingId: listing, body: 'Bonjour, mon numéro est le 699 00 00 00' } });
    expect(r.status).toBe(201);
    await call(ctx, 'POST', `/conversations/${r.body.conversationId}/messages`, { token: buyer.accessToken, body: { body: 'Toujours disponible ?' } });
    await wait(1800);
    expect(ctx.push.sent).toHaveLength(1);
    const [n] = ctx.push.sent;
    expect(n.to).toBe(T1);
    expect(n.body).toBe('Nouveau message · Vélo de course rouge');
    expect(JSON.stringify(n)).not.toContain('699');
    expect(n.data.url).toBe(`/conversation/${r.body.conversationId}`);
  });

  it('offre de prix : prévenu à chaque étape', async () => {
    await register(seller, T1);
    await call(ctx, 'POST', `/listings/${listing}/offers`, { token: buyer.accessToken, body: { amountXaf: 8000 } });
    await wait(1800);
    expect(ctx.push.sent.map((m) => m.body.replace(/\s/g, ' '))).toContain('Offre : 8 000 FCFA · Vélo de course rouge');
  });

  it('annonce approuvée par un modérateur : l’auteur est prévenu ; jeton périmé oublié', async () => {
    await register(seller, T1);
    await register(seller, T2);
    ctx.push.gone.add(T2);
    await ctx.db.execute(sql`update listings set status = 'pending_review' where id = ${listing}`);
    const mod = await loginAs(ctx, 'moderator');
    expect((await call(ctx, 'POST', `/admin/listings/${listing}/approve`, { token: mod.accessToken, body: {} })).status).toBe(200);
    await wait(1800);
    expect(ctx.push.sent.map((m) => [m.to, m.title, m.data.url])).toEqual([
      [T1, 'Annonce en ligne', `/listing/${listing}`],
      [T2, 'Annonce en ligne', `/listing/${listing}`],
    ]);
    expect(await tokensOf(seller.userId)).toEqual([T1]);
  });
});
