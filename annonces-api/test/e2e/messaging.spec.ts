import { sql } from 'drizzle-orm';
import { call, createTestApp, Ctx, login, loginAs, resetState, rows, seedActiveListings, Session } from '../helpers';

describe('Messagerie', () => {
  let ctx: Ctx;
  let seller: Session;
  let buyer: Session;
  let listingId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    seller = await login(ctx);
    buyer = await login(ctx);
    [listingId] = await seedActiveListings(ctx, seller.userId, 1, { title: () => 'Télévision LG 55 pouces' });
  });

  const start = (s: Session, body: string, id = listingId) =>
    call(ctx, 'POST', '/conversations', { token: s.accessToken, body: { listingId: id, body } });
  const send = (s: Session, conversationId: string, body: string) =>
    call(ctx, 'POST', `/conversations/${conversationId}/messages`, { token: s.accessToken, body: { body } });
  const unread = async (s: Session) => (await call(ctx, 'GET', '/conversations/unread-count', { token: s.accessToken })).body.count;

  it('premier message, réponse, non-lus et accusé de lecture', async () => {
    const first = await start(buyer, 'Bonjour, toujours disponible ?');
    expect(first.status).toBe(201);
    const convId = first.body.conversationId;

    expect(await unread(seller)).toBe(1);
    expect(await unread(buyer)).toBe(0);

    const inbox = await call(ctx, 'GET', '/conversations', { token: seller.accessToken });
    expect(inbox.body.items).toHaveLength(1);
    expect(inbox.body.items[0]).toMatchObject({
      id: convId,
      role: 'seller',
      unread: true,
      lastFromMe: false,
      lastMessagePreview: 'Bonjour, toujours disponible ?',
      listing: { id: listingId, title: 'Télévision LG 55 pouces' },
    });

    // Le vendeur ouvre : la conversation devient lue
    const opened = await call(ctx, 'GET', `/conversations/${convId}`, { token: seller.accessToken });
    expect(opened.body.messages.map((m: { body: string }) => m.body)).toEqual(['Bonjour, toujours disponible ?']);
    expect(opened.body.conversation).toMatchObject({ role: 'seller', iBlocked: false });
    expect(await unread(seller)).toBe(0);

    expect((await send(seller, convId, 'Oui, venez la voir à Akwa.')).status).toBe(201);
    expect(await unread(buyer)).toBe(1);

    const buyerView = await call(ctx, 'GET', `/conversations/${convId}`, { token: buyer.accessToken });
    expect(buyerView.body.otherLastReadAt).not.toBeNull(); // « Vu »
    expect(buyerView.body.messages).toHaveLength(2);
  });

  it('un même acheteur garde une seule conversation par annonce', async () => {
    const a = await start(buyer, 'Premier message');
    const b = await start(buyer, 'Deuxième message');
    expect(b.body.conversationId).toBe(a.body.conversationId);
    const [{ n }] = await rows(ctx, sql`select count(*)::int as n from conversations`);
    expect(n).toBe(1);

    const found = await call(ctx, 'GET', `/conversations/with-listing/${listingId}`, { token: buyer.accessToken });
    expect(found.body.id).toBe(a.body.conversationId);
  });

  it('relevé des nouveaux messages (after) et chargement des anciens (before)', async () => {
    const { body } = await start(buyer, 'm0');
    const convId = body.conversationId;
    for (let i = 1; i <= 54; i++) await send(i % 2 ? seller : buyer, convId, `m${i}`);

    const latest = await call(ctx, 'GET', `/conversations/${convId}`, { token: buyer.accessToken });
    expect(latest.body.messages).toHaveLength(50);
    expect(latest.body.messages.at(-1).body).toBe('m54');
    expect(latest.body.hasOlder).toBe(true);

    const older = await call(ctx, 'GET', `/conversations/${convId}?before=${latest.body.messages[0].id}`, { token: buyer.accessToken });
    expect(older.body.messages.map((m: { body: string }) => m.body)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
    expect(older.body.hasOlder).toBe(false);
    expect(older.body.conversation).toBeNull(); // métadonnées seulement au premier chargement

    const lastId = latest.body.messages.at(-1).id;
    await send(seller, convId, 'nouveau');
    const poll = await call(ctx, 'GET', `/conversations/${convId}?after=${lastId}`, { token: buyer.accessToken });
    expect(poll.body.messages.map((m: { body: string }) => m.body)).toEqual(['nouveau']);
  });

  it('signale les messages typiques d’arnaque au destinataire', async () => {
    const res = await start(buyer, 'Envoyez d’abord un ACOMPTE par Western Union, détails sur arnaque-promo.com');
    expect(res.body.message.flags.sort()).toEqual(['advance_payment', 'link', 'money_transfer']);
    const res2 = await send(seller, res.body.conversationId, 'Donne-moi le code que tu as reçu par SMS');
    expect(res2.body.flags).toEqual(['code_request']);
    const ok = await send(seller, res.body.conversationId, 'Rendez-vous demain au marché Mokolo.');
    expect(ok.body.flags).toEqual([]);
  });

  it('refuse d’écrire sur sa propre annonce ou sur une annonce hors ligne', async () => {
    expect((await start(seller, 'Bonjour')).body.code).toBe('OWN_LISTING');
    await ctx.db.execute(sql`update listings set status = 'sold' where id = ${listingId}`);
    expect((await start(buyer, 'Bonjour')).body.code).toBe('LISTING_NOT_FOUND');
  });

  it('une conversation n’est visible que par ses deux participants', async () => {
    const { body } = await start(buyer, 'Bonjour');
    const intruder = await login(ctx);
    expect((await call(ctx, 'GET', `/conversations/${body.conversationId}`, { token: intruder.accessToken })).status).toBe(404);
    expect((await send(intruder, body.conversationId, 'Coucou')).status).toBe(404);
    expect((await call(ctx, 'GET', '/conversations', { token: intruder.accessToken })).body.items).toEqual([]);
  });

  it('blocage : plus aucun message dans les deux sens, sans révéler qui a bloqué', async () => {
    const { body } = await start(buyer, 'Bonjour');
    await call(ctx, 'POST', `/users/${buyer.userId}/block`, { token: seller.accessToken });

    const fromBuyer = await send(buyer, body.conversationId, 'Allô ?');
    expect(fromBuyer.status).toBe(403);
    expect(fromBuyer.body).toMatchObject({ code: 'CANNOT_MESSAGE', message: 'Vous ne pouvez pas écrire à cet utilisateur.' });
    expect((await send(seller, body.conversationId, 'Test')).body.code).toBe('CANNOT_MESSAGE');

    const [other] = await seedActiveListings(ctx, seller.userId, 1, { title: () => 'Autre annonce' });
    expect((await start(buyer, 'Et celle-ci ?', other)).body.code).toBe('CANNOT_MESSAGE');

    const sellerView = await call(ctx, 'GET', `/conversations/${body.conversationId}`, { token: seller.accessToken });
    expect(sellerView.body.conversation.iBlocked).toBe(true);

    await call(ctx, 'DELETE', `/users/${buyer.userId}/block`, { token: seller.accessToken });
    expect((await send(buyer, body.conversationId, 'Merci')).status).toBe(201);
  });

  it('un compte de moins de 24 h ouvre 5 conversations par jour au maximum', async () => {
    const ids = await seedActiveListings(ctx, seller.userId, 6, { title: (i) => `Objet ${i}` });
    for (let i = 0; i < 5; i++) expect((await start(buyer, 'Bonjour', ids[i])).status).toBe(201);
    const sixth = await start(buyer, 'Bonjour', ids[5]);
    expect(sixth.status).toBe(429);

    // Un compte plus ancien n'a pas cette limite basse
    const veteran = await login(ctx);
    await ctx.db.execute(sql`update users set created_at = now() - interval '3 days' where id = ${veteran.userId}`);
    for (let i = 0; i < 6; i++) expect((await start(veteran, 'Bonjour', ids[i])).status).toBe(201);
  });

  it('ne peut pas écrire à un compte banni ; un compte suspendu ne peut pas écrire', async () => {
    const { body } = await start(buyer, 'Bonjour');
    await ctx.db.execute(sql`update users set status = 'banned' where id = ${seller.userId}`);
    expect((await send(buyer, body.conversationId, 'Allô')).body.code).toBe('RECIPIENT_INACTIVE');

    await ctx.db.execute(sql`update users set status = 'active' where id = ${seller.userId}`);
    await ctx.db.execute(sql`update users set status = 'suspended' where id = ${buyer.userId}`);
    expect((await send(buyer, body.conversationId, 'Allô')).body.code).toBe('USER_NOT_ACTIVE');
  });

  it('un modérateur ne lit une conversation que si elle a été signalée', async () => {
    const { body } = await start(buyer, 'Payez-moi d’avance svp');
    const mod = await loginAs(ctx, 'moderator');

    const before = await call(ctx, 'GET', `/admin/conversations/${body.conversationId}`, { token: mod.accessToken });
    expect(before.status).toBe(403);
    expect(before.body.code).toBe('NOT_REPORTED');

    const report = await call(ctx, 'POST', `/conversations/${body.conversationId}/report`, {
      token: seller.accessToken,
      body: { reason: 'scam' },
    });
    expect(report.status).toBe(200);
    const again = await call(ctx, 'POST', `/conversations/${body.conversationId}/report`, {
      token: seller.accessToken,
      body: { reason: 'scam' },
    });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_REPORTED');

    const after = await call(ctx, 'GET', `/admin/conversations/${body.conversationId}`, { token: mod.accessToken });
    expect(after.status).toBe(200);
    expect(after.body.messages[0].body).toBe('Payez-moi d’avance svp');

    // Un utilisateur simple n'a jamais accès à cette route
    expect((await call(ctx, 'GET', `/admin/conversations/${body.conversationId}`, { token: seller.accessToken })).status).toBe(403);
  });

  it('valide le contenu des messages', async () => {
    expect((await start(buyer, '   ')).body.code).toBe('VALIDATION_ERROR');
    expect((await start(buyer, 'x'.repeat(2001))).body.code).toBe('VALIDATION_ERROR');
    const res = await start(buyer, 'Ligne 1\r\n\n\n\n\n\nLigne 2');
    expect(res.body.message.body).toBe('Ligne 1\n\n\nLigne 2');
  });
});
