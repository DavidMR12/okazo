import { sql } from 'drizzle-orm';
import {
  activate,
  call,
  createListing,
  createTestApp,
  Ctx,
  login,
  loginAs,
  resetState,
  rows,
  seedActiveListings,
  Session,
} from '../helpers';

describe('Suppression de compte', () => {
  let ctx: Ctx;
  let user: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    user = await login(ctx);
  });

  /** Demande le code de confirmation et renvoie celui reçu par SMS. */
  const requestCode = async (s: Session) => {
    await ctx.redis.del(`rl:otp:cooldown:${s.phone}`);
    const res = await call(ctx, 'POST', '/me/delete/request', { token: s.accessToken });
    expect(res.status).toBe(200);
    return ctx.sms.lastCode(s.phone);
  };
  const remove = (s: Session, code: string) => call(ctx, 'DELETE', '/me', { token: s.accessToken, body: { code } });

  it('exige le code SMS : un jeton volé ne suffit pas', async () => {
    const code = await requestCode(user);
    const wrong = code === '000000' ? '111111' : '000000';
    const res = await remove(user, wrong);
    expect(res.body.code).toBe('INVALID_CODE');
    const [u] = await rows(ctx, sql`select status from users where id = ${user.userId}`);
    expect(u.status).toBe('active');
  });

  it('anonymise le compte, retire annonces, favoris, pièces d’identité et sessions', async () => {
    const id = await createListing(ctx, user);
    const [photoKey] = await rows<{ storage_key: string }>(ctx, sql`select storage_key from listing_images where listing_id = ${id}`);
    const other = await login(ctx);
    const [theirs] = await seedActiveListings(ctx, other.userId, 1);
    await ctx.db.execute(sql`insert into favorites (user_id, listing_id) values (${user.userId}, ${theirs}) on conflict do nothing`);
    const idKey = `verifications/${user.userId}/44444444-4444-4444-8444-444444444444.jpg`;
    ctx.storage.put(idKey, Buffer.from('pièce'), 'image/jpeg');
    await ctx.db.execute(sql`insert into user_verifications (user_id, kind, storage_key) values (${user.userId}, 'id_card', ${idKey})`);

    expect((await remove(user, await requestCode(user))).status).toBe(204);

    const [u] = await rows(ctx, sql`select phone_e164, display_name, status, deleted_at from users where id = ${user.userId}`);
    expect(u).toMatchObject({ phone_e164: null, display_name: 'Utilisateur supprimé', status: 'deleted' });
    expect(u.deleted_at).not.toBeNull();

    expect((await rows(ctx, sql`select status from listings where id = ${id}`))[0].status).toBe('removed');
    expect(await rows(ctx, sql`select 1 from favorites where user_id = ${user.userId}`)).toEqual([]);
    expect((await rows(ctx, sql`select storage_key from user_verifications where user_id = ${user.userId}`))[0].storage_key).toBe('deleted');
    expect(ctx.storage.files.has(idKey)).toBe(false);
    expect(ctx.storage.files.has(photoKey.storage_key)).toBe(false);

    // Accès coupé immédiatement, session impossible à renouveler
    expect((await call(ctx, 'GET', '/auth/me', { token: user.accessToken })).body.code).toBe('ACCOUNT_DISABLED');
    expect((await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: user.refreshToken } })).status).toBe(401);
  });

  it('efface le contenu de ses messages, l’interlocuteur voit « Message supprimé »', async () => {
    const seller = await login(ctx);
    const [listingId] = await seedActiveListings(ctx, seller.userId, 1);
    const conv = await call(ctx, 'POST', '/conversations', {
      token: user.accessToken,
      body: { listingId, body: 'Mon adresse est rue 12, Akwa' },
    });

    await remove(user, await requestCode(user));

    const view = await call(ctx, 'GET', `/conversations/${conv.body.conversationId}`, { token: seller.accessToken });
    expect(view.body.messages.map((m: { body: string }) => m.body)).toEqual(['Message supprimé']);
    const inbox = await call(ctx, 'GET', '/conversations', { token: seller.accessToken });
    expect(inbox.body.items[0].lastMessagePreview).toBe('Message supprimé');
  });

  it('le même numéro peut recréer un compte neuf', async () => {
    await remove(user, await requestCode(user));
    const again = await login(ctx, user.phone);
    expect(again.userId).not.toBe(user.userId);
    const [u] = await rows(ctx, sql`select trust_score, daily_listing_limit from users where id = ${again.userId}`);
    expect(u).toEqual({ trust_score: 0, daily_listing_limit: 3 });
  });

  it('supprimer son compte n’efface pas une sanction : le nouveau compte démarre bridé', async () => {
    const mod = await loginAs(ctx, 'moderator');
    await call(ctx, 'POST', '/admin/sanctions', {
      token: mod.accessToken,
      body: { userId: user.userId, type: 'warning', reason: 'Annonce trompeuse' },
    });
    expect((await remove(user, await requestCode(user))).status).toBe(204);

    const again = await login(ctx, user.phone);
    const [u] = await rows(ctx, sql`select trust_score, daily_listing_limit from users where id = ${again.userId}`);
    expect(u).toEqual({ trust_score: -20, daily_listing_limit: 1 });
  });

  it('un compte banni ne peut pas se supprimer lui-même', async () => {
    await ctx.db.execute(sql`update users set status = 'banned' where id = ${user.userId}`);
    const res = await call(ctx, 'POST', '/me/delete/request', { token: user.accessToken });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_BANNED');
  });

  it('les annonces d’un compte supprimé ne sont plus publiques', async () => {
    const id = await createListing(ctx, user);
    await activate(ctx, id);
    expect((await call(ctx, 'GET', `/listings/${id}`)).status).toBe(200);
    await remove(user, await requestCode(user));
    expect((await call(ctx, 'GET', `/listings/${id}`)).status).toBe(404);
  });
});
