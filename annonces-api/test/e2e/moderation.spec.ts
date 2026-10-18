import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { sha256 } from '../../src/common/crypto';
import { ModerationService } from '../../src/moderation/moderation.service';
import { RulesService } from '../../src/moderation/rules.service';
import {
  call,
  createListing,
  createTestApp,
  Ctx,
  login,
  makeImage,
  resetState,
  rows,
  seedActiveListings,
  Session,
  uploadPhotos,
} from '../helpers';

describe('Modération automatique', () => {
  let ctx: Ctx;
  let moderation: ModerationService;
  let seller: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
    moderation = ctx.app.get(ModerationService);
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    // Les règles de mots-clés sont gardées 60 s en cache : on repart de la base à chaque test
    (ctx.app.get(RulesService) as unknown as { textRulesCache: unknown }).textRulesCache = null;
    seller = await login(ctx);
  });

  /** Vendeur ayant déjà 3 annonces approuvées : plus de relecture systématique. */
  const makeTrusted = (s: Session) => seedActiveListings(ctx, s.userId, 3, { title: (i) => `Ancienne annonce ${i}` });

  const listing = async (id: string) =>
    (await rows(ctx, sql`select status, rejection_reason, published_at, expires_at from listings where id = ${id}`))[0];
  const actions = (id: string) =>
    rows(ctx, sql`select action::text, reason_code, rule_hits from moderation_actions where listing_id = ${id} order by id`);

  it('traite les photos : WebP sans métadonnées, miniature, empreintes, original supprimé', async () => {
    const [key] = await uploadPhotos(ctx, seller, [await makeImage(1, 2000, 1500)]);
    const id = await createListing(ctx, seller, { imageKeys: [key] });
    await moderation.process(id);

    const [img] = await rows(ctx, sql`select id, storage_key, width, height, sha256, phash::text from listing_images where listing_id = ${id}`);
    expect(img.storage_key).toBe(`listings/${id}/${img.id}-1200.webp`);
    expect([img.width, img.height]).toEqual([1200, 900]);
    expect(img.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(img.phash).toMatch(/^[01]{64}$/);

    expect(ctx.storage.files.has(key)).toBe(false);
    expect(ctx.storage.files.get(img.storage_key)?.contentType).toBe('image/webp');
    expect(ctx.storage.files.has(img.storage_key.replace('-1200', '-400'))).toBe(true);
  });

  it('nouveau vendeur : relecture humaine, l’annonce reste en attente', async () => {
    const id = await createListing(ctx, seller);
    await moderation.process(id);
    expect((await listing(id)).status).toBe('pending_review');
    const [a] = await actions(id);
    expect(a).toMatchObject({ action: 'send_to_review', reason_code: 'NEW_SELLER' });
  });

  it('vendeur de confiance sans alerte : publiée pour 30 jours', async () => {
    await makeTrusted(seller);
    const id = await createListing(ctx, seller);
    await moderation.process(id);

    const l = await listing(id);
    expect(l.status).toBe('active');
    expect(l.published_at).not.toBeNull();
    const days = (new Date(l.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    expect((await actions(id)).map((a) => a.action)).toEqual(['auto_approve']);
  });

  it('mot-clé interdit : refus automatique avec un message neutre', async () => {
    await makeTrusted(seller);
    await ctx.db.execute(sql`insert into blocklist (kind, value, action) values ('keyword', 'contrefaçon', 'block')`);
    const id = await createListing(ctx, seller, { description: 'Montre de luxe, CONTREFACON de très bonne qualité.' });
    await moderation.process(id);

    const l = await listing(id);
    expect(l.status).toBe('rejected');
    expect(l.rejection_reason).toBe('Votre annonce contient des termes non autorisés.');
    expect((await actions(id))[0]).toMatchObject({ action: 'auto_reject', reason_code: 'KEYWORD' });
  });

  it('signal d’alerte (« acompte ») ou lien externe : relecture humaine', async () => {
    await makeTrusted(seller);
    const a = await createListing(ctx, seller, { description: 'Envoyez un acompte pour réserver le téléphone.' });
    const b = await createListing(ctx, seller, { title: 'Téléphone neuf', description: 'Plus de photos sur www.monsite.com merci.' });
    await moderation.process(a);
    await moderation.process(b);
    expect((await listing(a)).status).toBe('pending_review');
    expect((await actions(a))[0].rule_hits[0]).toMatchObject({ rule: 'keyword', severity: 'review', detail: 'acompte' });
    expect((await actions(b))[0].rule_hits[0]).toMatchObject({ rule: 'external_link' });
  });

  it('photo illisible ou trop petite : refus automatique', async () => {
    await makeTrusted(seller);
    const [tiny] = await uploadPhotos(ctx, seller, [await makeImage(2, 120, 90)]);
    const id = await createListing(ctx, seller, { imageKeys: [tiny] });
    await moderation.process(id);
    expect(await listing(id)).toMatchObject({
      status: 'rejected',
      rejection_reason: 'Une photo est illisible ou trop petite. Utilisez des photos nettes (JPEG, PNG ou WebP).',
    });

    const [junk] = await uploadPhotos(ctx, seller, [Buffer.from('pas une image')]);
    const id2 = await createListing(ctx, seller, { imageKeys: [junk], title: 'Autre téléphone' });
    await moderation.process(id2);
    expect((await listing(id2)).status).toBe('rejected');
  });

  it('photo déjà publiée par un autre vendeur : relecture ; par un vendeur banni : refus', async () => {
    const photo = await makeImage(3);
    const thief = await login(ctx);
    await makeTrusted(thief);

    // Le vendeur d'origine publie la photo
    await makeTrusted(seller);
    const original = await createListing(ctx, seller, { imageKeys: await uploadPhotos(ctx, seller, [photo]) });
    await moderation.process(original);
    expect((await listing(original)).status).toBe('active');

    // Un autre compte la réutilise, recompressée : empreinte exacte différente, empreinte perceptuelle proche
    const recompressed = await sharp(photo).jpeg({ quality: 70 }).toBuffer();
    const copy = await createListing(ctx, thief, { imageKeys: await uploadPhotos(ctx, thief, [recompressed]) });
    await moderation.process(copy);
    expect((await listing(copy)).status).toBe('pending_review');
    expect((await actions(copy))[0].rule_hits).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'duplicate_image', severity: 'review' })]),
    );

    // Si l'auteur d'origine est banni (photos d'arnaque), la réutilisation est refusée d'office
    await ctx.db.execute(sql`update users set status = 'banned' where id = ${seller.userId}`);
    // (copie exacte cette fois : détectée par l'empreinte SHA-256)
    const copy2 = await createListing(ctx, thief, { imageKeys: await uploadPhotos(ctx, thief, [photo]), title: 'Encore la même' });
    await moderation.process(copy2);
    expect((await listing(copy2)).status).toBe('rejected');
  });

  it('photo inscrite sur la liste noire : refus', async () => {
    await makeTrusted(seller);
    const photo = await makeImage(4);
    await ctx.db.execute(sql`insert into blocklist (kind, value, action) values ('image_hash', ${sha256(photo)}, 'block')`);
    const id = await createListing(ctx, seller, { imageKeys: await uploadPhotos(ctx, seller, [photo]) });
    await moderation.process(id);
    expect(await listing(id)).toMatchObject({ status: 'rejected', rejection_reason: "Une des photos n'est pas autorisée." });
  });

  it('prix anormalement bas par rapport aux annonces comparables : relecture', async () => {
    const other = await login(ctx);
    await seedActiveListings(ctx, other.userId, 10, { price: 200000 });
    await makeTrusted(seller);
    const id = await createListing(ctx, seller, { priceXaf: 20000 });
    await moderation.process(id);
    expect((await listing(id)).status).toBe('pending_review');
    expect((await actions(id))[0].reason_code).toBe('PRICE_TOO_LOW');
  });

  it('même annonce republiée par le même vendeur : relecture', async () => {
    await makeTrusted(seller);
    const a = await createListing(ctx, seller, { title: 'iPhone 13 Pro Max' });
    await moderation.process(a);
    const b = await createListing(ctx, seller, { title: 'IPHONE 13 PRO MAX' });
    await moderation.process(b);
    expect((await actions(b))[0].reason_code).toBe('DUPLICATE_LISTING');
  });

  it('ne revient jamais sur la décision d’un modérateur', async () => {
    await makeTrusted(seller);
    const id = await createListing(ctx, seller);
    await ctx.db.execute(sql`update listings set status = 'rejected', rejection_reason = 'Refus manuel' where id = ${id}`);
    await moderation.process(id);
    expect(await listing(id)).toMatchObject({ status: 'rejected', rejection_reason: 'Refus manuel' });
    expect(await actions(id)).toEqual([]);
  });

  it('trois signalements de personnes différentes renvoient l’annonce en relecture', async () => {
    const [id] = await seedActiveListings(ctx, seller.userId, 1);
    for (let i = 0; i < 3; i++) {
      const reporter = await login(ctx);
      const res = await call(ctx, 'POST', '/reports', { token: reporter.accessToken, body: { listingId: id, reason: 'scam' } });
      expect(res.status).toBe(201);
      expect((await listing(id)).status).toBe(i < 2 ? 'active' : 'pending_review');
    }
  });
});
