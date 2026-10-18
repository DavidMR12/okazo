import { sql } from 'drizzle-orm';
import {
  activate,
  call,
  categoryId,
  createListing,
  createTestApp,
  Ctx,
  listingBody,
  login,
  loginAs,
  makeImage,
  resetState,
  rows,
  seedActiveListings,
  Session,
  uploadPhotos,
} from '../helpers';

describe('Annonces', () => {
  let ctx: Ctx;
  let seller: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    seller = await login(ctx);
  });

  const post = async (s: Session, overrides: Record<string, unknown> = {}) =>
    call(ctx, 'POST', '/listings', { token: s.accessToken, body: await listingBody(ctx, s, overrides) });

  // ---------------------------------------------------------------- publication
  describe('publication', () => {
    it('une nouvelle annonce attend la modération et n’est pas publique', async () => {
      const res = await post(seller);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending_review');

      expect((await call(ctx, 'GET', `/listings/${res.body.id}`)).status).toBe(404);
      expect((await call(ctx, 'GET', '/listings')).body.items).toHaveLength(0);

      const mine = await call(ctx, 'GET', '/me/listings', { token: seller.accessToken });
      expect(mine.body.items).toHaveLength(1);
      expect(mine.body.items[0]).toMatchObject({ id: res.body.id, status: 'pending_review', thumbnailUrl: null });
    });

    it('n’accepte que des photos envoyées par le vendeur lui-même, une seule fois', async () => {
      const other = await login(ctx);
      const [foreignKey] = await uploadPhotos(ctx, other, [await makeImage(1)]);
      expect((await post(seller, { imageKeys: [foreignKey] })).body.code).toBe('IMAGE_KEY_INVALID');

      const missing = `pending/${seller.userId}/00000000-0000-4000-8000-000000000000.jpg`;
      expect((await post(seller, { imageKeys: [missing] })).body.code).toBe('IMAGE_NOT_UPLOADED');

      const [key] = await uploadPhotos(ctx, seller, [await makeImage(2)]);
      expect((await post(seller, { imageKeys: [key] })).status).toBe(201);
      const reuse = await post(seller, { imageKeys: [key], title: 'Une autre annonce' });
      expect(reuse.status).toBe(409);
      expect(reuse.body.code).toBe('IMAGE_ALREADY_USED');
    });

    it('refuse un fichier qui n’est pas une image acceptée', async () => {
      const [key] = await uploadPhotos(ctx, seller, [await makeImage(3)]);
      ctx.storage.put(key, Buffer.from('<html>'), 'text/html'); // contenu remplacé après coup
      expect((await post(seller, { imageKeys: [key] })).body.code).toBe('IMAGE_TYPE');
    });

    it('vérifie la cohérence du prix', async () => {
      expect((await post(seller, { priceType: 'fixed', priceXaf: null })).body.code).toBe('PRICE_REQUIRED');
      const free = await post(seller, { priceType: 'free', priceXaf: 5000 });
      expect(free.status).toBe(201);
      const [l] = await rows(ctx, sql`select price_xaf from listings where id = ${free.body.id}`);
      expect(Number(l.price_xaf)).toBe(0);
    });

    it('publie seulement dans une sous-catégorie', async () => {
      const parent = await categoryId(ctx, 'electronique');
      expect((await post(seller, { categoryId: parent })).body.code).toBe('CATEGORY_INVALID');
    });

    it('exige une identité vérifiée pour les véhicules (règle de la base)', async () => {
      const cars = await categoryId(ctx, 'voitures');
      const res = await post(seller, { categoryId: cars });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('IDENTITY_VERIFICATION_REQUIRED');

      await ctx.db.execute(sql`update users set verification_level = 'identity' where id = ${seller.userId}`);
      expect((await post(seller, { categoryId: cars })).status).toBe(201);
    });

    it('« Je recherche » : publiable sans identité vérifiée, même dans une catégorie sensible', async () => {
      const cars = await categoryId(ctx, 'voitures');
      const res = await post(seller, { categoryId: cars, adType: 'request', title: 'Je cherche une Toyota Yaris' });
      expect(res.status).toBe(201);
      const jobs = await categoryId(ctx, 'offres-emploi');
      expect((await post(seller, { categoryId: jobs, adType: 'request', title: 'Comptable cherche un poste' })).status).toBe(201);
      const [l] = await rows(ctx, sql`select ad_type from listings where id = ${res.body.id}`);
      expect(l.ad_type).toBe('request');
    });

    it('recruter ou proposer une garde d’enfants exige une identité vérifiée', async () => {
      for (const slug of ['offres-emploi', 'garde-enfants', 'menage-aide-domicile']) {
        const res = await post(seller, { categoryId: await categoryId(ctx, slug), title: `Offre ${slug}` });
        expect(res.body.code).toBe('IDENTITY_VERIFICATION_REQUIRED');
      }
      // Les autres services et les petits boulots restent ouverts à tous
      expect((await post(seller, { categoryId: await categoryId(ctx, 'cours-particuliers'), title: 'Cours de maths niveau lycée' })).status).toBe(201);
    });

    it('photos facultatives pour l’emploi et les services, obligatoires ailleurs', async () => {
      const job = await post(seller, { categoryId: await categoryId(ctx, 'petits-boulots'), title: 'Cherche manutentionnaire samedi', imageKeys: [] });
      expect(job.status).toBe(201);
      const lesson = await call(ctx, 'POST', '/listings', {
        token: seller.accessToken,
        body: { ...(await listingBody(ctx, seller, { categoryId: await categoryId(ctx, 'cours-particuliers'), title: 'Cours d’anglais' })), imageKeys: undefined },
      });
      expect(lesson.status).toBe(201);

      const phone = await post(seller, { imageKeys: [], title: 'Téléphone sans photo' });
      expect(phone.status).toBe(400);
      expect(phone.body.code).toBe('PHOTO_REQUIRED');

      // Retirer toutes les photos d'un objet en modification : refusé aussi
      const id = await createListing(ctx, seller, { title: 'Téléphone avec photo' });
      await activate(ctx, id);
      const res = await call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body: { photos: [] } });
      expect(res.body.code).toBe('PHOTO_REQUIRED');
    });

    it('champs propres à la catégorie : obligatoires pour proposer, valeurs vérifiées', async () => {
      await ctx.db.execute(sql`update users set verification_level = 'identity' where id = ${seller.userId}`);
      const cars = await categoryId(ctx, 'voitures');
      const missing = await post(seller, { categoryId: cars, attributes: { brand: 'toyota' } });
      expect(missing.status).toBe(400);
      expect(missing.body).toMatchObject({ code: 'ATTRIBUTE_INVALID', field: 'year' });
      expect((await post(seller, { categoryId: cars, attributes: { brand: 'tesla', year: 2015 } })).body.field).toBe('brand');

      const ok = await post(seller, {
        categoryId: cars,
        title: 'Toyota Corolla 2012 climatisée',
        attributes: { brand: 'toyota', year: '2012', mileage: 98000, customs: 'dedouane', pirate: 'ignoré' },
      });
      expect(ok.status).toBe(201);
      const [l] = await rows(ctx, sql`select attributes from listings where id = ${ok.body.id}`);
      expect(l.attributes).toEqual({ brand: 'toyota', year: 2012, mileage: 98000, customs: 'dedouane' });

      // Une demande n'a pas de champ obligatoire
      expect((await post(seller, { categoryId: cars, adType: 'request', title: 'Cherche une voiture', attributes: {} })).status).toBe(201);
    });

    it('emploi : pas d’« état », pas de salaire « gratuit », salaire affiché par mois', async () => {
      await ctx.db.execute(sql`update users set verification_level = 'identity' where id = ${seller.userId}`);
      const jobs = await categoryId(ctx, 'offres-emploi');
      expect((await post(seller, { categoryId: jobs, priceType: 'free' })).body.code).toBe('PRICE_TYPE_INVALID');

      const res = await post(seller, {
        categoryId: jobs,
        title: 'Vendeuse en boutique, Akwa',
        priceXaf: 120000,
        condition: 'new',
        attributes: { contract: 'cdi', schedule: 'temps_plein' },
        imageKeys: [],
      });
      expect(res.status).toBe(201);
      await activate(ctx, res.body.id);
      const detail = (await call(ctx, 'GET', `/listings/${res.body.id}`)).body;
      expect(detail.condition).toBeNull();
      expect(detail.priceLabel).toBe('Salaire mensuel');
      expect(detail.priceUnit).toBe('mois');
      expect(detail.category.parentSlug).toBe('emploi'); // conseils de sécurité propres à l'emploi
      expect(detail.facts).toEqual([
        { key: 'contract', label: 'Type de contrat', value: 'CDI' },
        { key: 'schedule', label: 'Temps de travail', value: 'Temps plein' },
      ]);
    });

    it('modifier le titre d’une annonce sans toucher aux champs ne revalide pas les champs', async () => {
      const id = await createListing(ctx, seller);
      await activate(ctx, id);
      // Annonce plus ancienne que le formulaire : sans marque
      await ctx.db.execute(sql`update listings set attributes = '{}'::jsonb where id = ${id}`);
      expect((await call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body: { title: 'Nouveau titre du téléphone' } })).status).toBe(200);
    });

    it('passer une demande en offre par modification exige aussi l’identité', async () => {
      const id = await createListing(ctx, seller, { categoryId: await categoryId(ctx, 'offres-emploi'), adType: 'request', title: 'Je cherche un emploi' });
      await activate(ctx, id);
      const res = await call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body: { adType: 'offer' } });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('IDENTITY_VERIFICATION_REQUIRED');
    });

    it('limite le nombre d’annonces par jour (règle de la base)', async () => {
      for (let i = 0; i < 3; i++) expect((await post(seller, { title: `Annonce ${i} du jour` })).status).toBe(201);
      const res = await post(seller, { title: 'Une annonce de trop' });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('DAILY_LISTING_LIMIT_REACHED');
    });

    it('un compte suspendu ne peut pas publier', async () => {
      await ctx.db.execute(sql`update users set status = 'suspended' where id = ${seller.userId}`);
      const res = await post(seller);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('USER_NOT_ACTIVE');
    });
  });

  // ---------------------------------------------------------------- modification
  describe('modification', () => {
    it('bloquée pendant la vérification', async () => {
      const id = await createListing(ctx, seller);
      const res = await call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body: { title: 'Nouveau titre' } });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('IN_REVIEW');
    });

    it('une annonce en ligne modifiée repasse en modération et disparaît du public', async () => {
      const id = await createListing(ctx, seller);
      await activate(ctx, id);
      expect((await call(ctx, 'GET', `/listings/${id}`)).status).toBe(200);

      const res = await call(ctx, 'PATCH', `/listings/${id}`, {
        token: seller.accessToken,
        body: { title: 'Samsung A54 à saisir', priceXaf: 120000 },
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pending_review');
      expect((await call(ctx, 'GET', `/listings/${id}`)).status).toBe(404);

      const [l] = await rows(ctx, sql`select title, price_xaf, description from listings where id = ${id}`);
      expect(l).toMatchObject({ title: 'Samsung A54 à saisir', description: 'Très bon état, vendu avec chargeur et facture.' });
      expect(Number(l.price_xaf)).toBe(120000);
    });

    it('une annonce expirée modifiée est republiée avec de nouvelles dates', async () => {
      const id = await createListing(ctx, seller);
      await activate(ctx, id);
      await ctx.db.execute(sql`update listings set status = 'expired', published_at = now() - interval '40 days', expires_at = now() - interval '10 days' where id = ${id}`);

      await call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body: { priceXaf: 99000 } });
      const [l] = await rows(ctx, sql`select status, published_at, expires_at from listings where id = ${id}`);
      expect(l).toEqual({ status: 'pending_review', published_at: null, expires_at: null });

      await activate(ctx, id);
      const [after] = await rows(ctx, sql`select expires_at > now() + interval '29 days' as fresh from listings where id = ${id}`);
      expect(after.fresh).toBe(true);
    });

    it('refuse une annonce vendue, ou celle d’un autre vendeur', async () => {
      const id = await createListing(ctx, seller);
      await activate(ctx, id);
      const other = await login(ctx);
      expect((await call(ctx, 'PATCH', `/listings/${id}`, { token: other.accessToken, body: { title: 'Piratée !' } })).status).toBe(404);

      await call(ctx, 'POST', `/listings/${id}/mark-sold`, { token: seller.accessToken });
      const res = await call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body: { title: 'Encore là' } });
      expect(res.body.code).toBe('NOT_EDITABLE');
    });

    it('changer vers une catégorie réservée exige aussi l’identité', async () => {
      const id = await createListing(ctx, seller);
      await activate(ctx, id);
      const res = await call(ctx, 'PATCH', `/listings/${id}`, {
        token: seller.accessToken,
        body: { categoryId: await categoryId(ctx, 'motos') },
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('IDENTITY_VERIFICATION_REQUIRED');
    });

    it('photos : réordonne, ajoute, retire et supprime les fichiers retirés', async () => {
      const id = await createListing(ctx, seller, {
        imageKeys: await uploadPhotos(ctx, seller, [await makeImage(10), await makeImage(11)]),
      });
      // Simule des photos déjà traitées par la modération
      const imgs = await rows<{ id: string; position: number }>(ctx, sql`select id, position from listing_images where listing_id = ${id} order by position`);
      const processed = imgs.map((i) => `listings/${id}/${i.id}-1200.webp`);
      for (const [n, i] of imgs.entries()) {
        await ctx.db.execute(sql`update listing_images set storage_key = ${processed[n]}, sha256 = ${'sha' + n} where id = ${i.id}`);
        ctx.storage.put(processed[n], Buffer.from('x'), 'image/webp');
        ctx.storage.put(processed[n].replace('-1200', '-400'), Buffer.from('x'), 'image/webp');
      }
      await activate(ctx, id);

      const [fresh] = await uploadPhotos(ctx, seller, [await makeImage(12)]);
      const res = await call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body: { photos: [fresh, processed[1]] } });
      expect(res.status).toBe(200);

      const after = await rows(ctx, sql`select storage_key, position, sha256 from listing_images where listing_id = ${id} order by position`);
      expect(after).toEqual([
        { storage_key: fresh, position: 0, sha256: null },
        { storage_key: processed[1], position: 1, sha256: 'sha1' }, // empreinte conservée : pas retraitée
      ]);
      expect(ctx.storage.files.has(processed[0])).toBe(false);
      expect(ctx.storage.files.has(processed[0].replace('-1200', '-400'))).toBe(false);
      expect(ctx.storage.files.has(processed[1])).toBe(true);
    });

    it('refuse des photos d’un autre vendeur à la modification', async () => {
      const id = await createListing(ctx, seller);
      await activate(ctx, id);
      const other = await login(ctx);
      const [foreign] = await uploadPhotos(ctx, other, [await makeImage(20)]);
      const res = await call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body: { photos: [foreign] } });
      expect(res.body.code).toBe('IMAGE_KEY_INVALID');
    });
  });

  // ---------------------------------------------------------------- cycle de vie
  describe('cycle de vie', () => {
    it('vendue : reste consultable mais sort du flux', async () => {
      const [id] = await seedActiveListings(ctx, seller.userId, 1);
      expect((await call(ctx, 'POST', `/listings/${id}/mark-sold`, { token: seller.accessToken })).status).toBe(200);
      expect((await call(ctx, 'GET', `/listings/${id}`)).body.status).toBe('sold');
      expect((await call(ctx, 'GET', '/listings')).body.items).toHaveLength(0);
    });

    it('supprimée : disparaît partout, y compris de « mes annonces »', async () => {
      const [id] = await seedActiveListings(ctx, seller.userId, 1);
      expect((await call(ctx, 'DELETE', `/listings/${id}`, { token: seller.accessToken })).status).toBe(204);
      expect((await call(ctx, 'GET', `/listings/${id}`)).status).toBe(404);
      expect((await call(ctx, 'GET', '/me/listings', { token: seller.accessToken })).body.items).toHaveLength(0);
    });

    it('expirée : n’est plus publique, et la tâche planifiée change son statut', async () => {
      const [id] = await seedActiveListings(ctx, seller.userId, 1);
      await ctx.db.execute(sql`update listings set expires_at = now() - interval '1 minute' where id = ${id}`);
      expect((await call(ctx, 'GET', `/listings/${id}`)).status).toBe(404);
      expect((await call(ctx, 'GET', '/listings')).body.items).toHaveLength(0);

      const [{ n }] = await rows(ctx, sql`select expire_old_listings() as n`);
      expect(n).toBe(1);
    });

    it('vendeur banni : ses annonces sont retirées', async () => {
      const [id] = await seedActiveListings(ctx, seller.userId, 1);
      const admin = await loginAs(ctx, 'admin');
      await call(ctx, 'POST', '/admin/sanctions', {
        token: admin.accessToken,
        body: { userId: seller.userId, type: 'ban', reason: 'Fraude avérée' },
      });
      expect((await call(ctx, 'GET', `/listings/${id}`)).status).toBe(404);
      const [l] = await rows(ctx, sql`select status from listings where id = ${id}`);
      expect(l.status).toBe('removed');
    });

    it('vendeur suspendu : ses annonces sont masquées sans être retirées', async () => {
      const [id] = await seedActiveListings(ctx, seller.userId, 1);
      await ctx.db.execute(sql`update users set status = 'suspended' where id = ${seller.userId}`);
      expect((await call(ctx, 'GET', `/listings/${id}`)).status).toBe(404);
      await ctx.db.execute(sql`update users set status = 'active' where id = ${seller.userId}`);
      expect((await call(ctx, 'GET', `/listings/${id}`)).status).toBe(200);
    });
  });

  // ---------------------------------------------------------------- contact
  describe('contact du vendeur', () => {
    it('numéro jamais public ; donné aux personnes connectées avec un lien WhatsApp', async () => {
      const [id] = await seedActiveListings(ctx, seller.userId, 1, { title: () => 'Frigo Samsung' });
      const detail = await call(ctx, 'GET', `/listings/${id}`);
      expect(JSON.stringify(detail.body)).not.toContain(seller.phone);

      expect((await call(ctx, 'GET', `/listings/${id}/contact`)).status).toBe(401);

      const buyer = await login(ctx);
      const res = await call(ctx, 'GET', `/listings/${id}/contact`, { token: buyer.accessToken });
      expect(res.body.phone).toBe(seller.phone);
      expect(res.body.whatsappUrl).toBe(
        `https://wa.me/${seller.phone.slice(1)}?text=${encodeURIComponent('Bonjour, votre annonce « Frigo Samsung » est-elle toujours disponible ?')}`,
      );
    });

    it('respecte le choix « messagerie uniquement » du vendeur', async () => {
      const [id] = await seedActiveListings(ctx, seller.userId, 1);
      await call(ctx, 'PATCH', '/me', { token: seller.accessToken, body: { contactPreference: 'messages_only' } });
      const buyer = await login(ctx);
      const res = await call(ctx, 'GET', `/listings/${id}/contact`, { token: buyer.accessToken });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MESSAGES_ONLY');
      expect((await call(ctx, 'GET', `/listings/${id}`)).body.seller.contactPreference).toBe('messages_only');
    });

    it('limite les vendeurs consultables par jour ; revoir la même annonce ne compte pas', async () => {
      const [a, b] = await seedActiveListings(ctx, seller.userId, 2);
      const buyer = await login(ctx);
      const key = `contact:${buyer.userId}:${new Date().toISOString().slice(0, 10)}`;
      await ctx.redis.sadd(key, ...Array.from({ length: 49 }, (_, i) => `deja-vu-${i}`));

      expect((await call(ctx, 'GET', `/listings/${a}/contact`, { token: buyer.accessToken })).status).toBe(200); // 50e
      expect((await call(ctx, 'GET', `/listings/${a}/contact`, { token: buyer.accessToken })).status).toBe(200); // déjà vue
      const over = await call(ctx, 'GET', `/listings/${b}/contact`, { token: buyer.accessToken });
      expect(over.status).toBe(429);
      expect(over.body.code).toBe('CONTACT_LIMIT_REACHED');
      expect(await ctx.redis.ttl(key)).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------- liste publique
  describe('liste publique et pagination', () => {
    it('parcourt toutes les annonces sans doublon ni oubli, même à date égale', async () => {
      const ids = await seedActiveListings(ctx, seller.userId, 7, { publishedAt: '2026-01-01T10:00:00.123456Z' });
      ids.push(...(await seedActiveListings(ctx, seller.userId, 3))); // plus récentes

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const q: string = cursor ? `&cursor=${cursor}` : '';
        const res = await call(ctx, 'GET', `/listings?limit=3${q}`);
        expect(res.status).toBe(200);
        seen.push(...res.body.items.map((i: { id: string }) => i.id));
        cursor = res.body.nextCursor;
        pages++;
      } while (cursor && pages < 10);

      expect(pages).toBe(4);
      expect(new Set(seen).size).toBe(10);
      expect(seen.sort()).toEqual([...ids].sort());
    });

    it('les annonces publiées pendant la lecture ne décalent pas les pages suivantes', async () => {
      await seedActiveListings(ctx, seller.userId, 4);
      const p1 = await call(ctx, 'GET', '/listings?limit=2');
      await seedActiveListings(ctx, seller.userId, 2, { title: (i) => `Nouvelle ${i}` });
      const p2 = await call(ctx, 'GET', `/listings?limit=2&cursor=${p1.body.nextCursor}`);
      const all = [...p1.body.items, ...p2.body.items].map((i: { title: string }) => i.title);
      expect(all).toEqual(['Annonce numéro 3', 'Annonce numéro 2', 'Annonce numéro 1', 'Annonce numéro 0']);
    });

    it('refuse un curseur invalide ou falsifié', async () => {
      expect((await call(ctx, 'GET', '/listings?cursor=nimportequoi')).body.code).toBe('INVALID_CURSOR');
      const forged = Buffer.from(JSON.stringify({ t: "2026-01-01'; drop table users; --", i: 'x' })).toString('base64url');
      expect((await call(ctx, 'GET', `/listings?cursor=${forged}`)).body.code).toBe('INVALID_CURSOR');
    });

    it('filtres : catégorie parente, prix, ville, recherche', async () => {
      await seedActiveListings(ctx, seller.userId, 1, { category: 'telephones', price: 50000, title: () => 'iPhone 12 débloqué' });
      await seedActiveListings(ctx, seller.userId, 1, { category: 'ordinateurs', price: 300000, title: () => 'Ordinateur portable HP' });
      await seedActiveListings(ctx, seller.userId, 1, { category: 'meubles', price: 80000, city: 'yaounde', title: () => 'Canapé trois places' });

      const titles = async (q: string) =>
        (await call(ctx, 'GET', `/listings?${q}`)).body.items.map((i: { title: string }) => i.title).sort();

      expect(await titles(`categoryId=${await categoryId(ctx, 'electronique')}`)).toEqual(['Ordinateur portable HP', 'iPhone 12 débloqué']);
      expect(await titles('minPrice=60000&maxPrice=100000')).toEqual(['Canapé trois places']);
      expect(await titles(`cityId=${(await rows(ctx, sql`select id from cities where slug = 'yaounde'`))[0].id}`)).toEqual(['Canapé trois places']);
      expect(await titles('q=ordinateurs')).toEqual(['Ordinateur portable HP']); // racine française
      expect(await titles('q=iphone')).toEqual(['iPhone 12 débloqué']);
      expect(await titles('q=100%25')).toEqual([]); // caractère spécial échappé
      expect(await titles('country=ga')).toEqual([]);
    });

    it('sépare les offres et les demandes (« Je recherche »)', async () => {
      const [offer, request] = await seedActiveListings(ctx, seller.userId, 2);
      await ctx.db.execute(sql`update listings set ad_type = 'request' where id = ${request}`);
      const all = await call(ctx, 'GET', '/listings');
      expect(all.body.items.map((i: { id: string; adType: string }) => [i.id, i.adType]).sort()).toEqual([[offer, 'offer'], [request, 'request']].sort());
      expect((await call(ctx, 'GET', '/listings?adType=request')).body.items.map((i: { id: string }) => i.id)).toEqual([request]);
      expect((await call(ctx, 'GET', `/listings/${request}`)).body.adType).toBe('request');
      expect((await call(ctx, 'GET', '/listings?adType=autre')).body.code).toBe('VALIDATION_ERROR');
    });

    it('catégories façon LeBonCoin : emploi, services à la personne, sous-catégories partout', async () => {
      const { body } = await call(ctx, 'GET', '/categories');
      const bySlug = Object.fromEntries(body.categories.map((c: { slug: string }) => [c.slug, c]));
      expect(body.categories.slice(0, 4).map((c: { slug: string }) => c.slug)).toEqual(['vehicules', 'immobilier', 'emploi', 'services']);
      expect(bySlug.emploi.children.map((c: { slug: string }) => c.slug)).toEqual(['offres-emploi', 'petits-boulots', 'stages']);
      expect(bySlug.services.children.find((c: { slug: string }) => c.slug === 'garde-enfants').requiresVerification).toBe(true);
      expect(bySlug.services.requiresVerification).toBe(false);
      // Toutes les catégories principales ont des sous-catégories (on publie toujours dans une sous-catégorie)
      expect(body.categories.filter((c: { children: unknown[] }) => !c.children.length)).toEqual([]);
    });

    it('filtres sur les champs de la catégorie (marque, année)', async () => {
      await ctx.db.execute(sql`update users set verification_level = 'identity' where id = ${seller.userId}`);
      const cars = await categoryId(ctx, 'voitures');
      const ids = await seedActiveListings(ctx, seller.userId, 3, { category: 'voitures', title: (i) => `Voiture ${i}` });
      const attrs = [{ brand: 'toyota', year: 2008 }, { brand: 'toyota', year: 2016 }, { brand: 'hyundai', year: 2019 }];
      for (const [i, a] of attrs.entries()) await ctx.db.execute(sql`update listings set attributes = ${JSON.stringify(a)}::jsonb where id = ${ids[i]}`);

      const titles = async (q: string) =>
        (await call(ctx, 'GET', `/listings?categoryId=${cars}&${q}`)).body.items.map((i: { title: string }) => i.title).sort();
      expect(await titles('a_brand=toyota')).toEqual(['Voiture 0', 'Voiture 1']);
      expect(await titles('a_brand=toyota,hyundai&a_year_min=2010')).toEqual(['Voiture 1', 'Voiture 2']);
      expect(await titles('a_year_max=2010')).toEqual(['Voiture 0']);
      expect(await titles('a_brand=inconnue')).toEqual(['Voiture 0', 'Voiture 1', 'Voiture 2']); // valeur hors liste : ignorée
      expect(await titles('a_model=Corolla')).toEqual(['Voiture 0', 'Voiture 1', 'Voiture 2']); // champ non filtrable : ignoré
    });

    it('tarif horaire d’un service affiché « / h » dans les listes', async () => {
      const [id] = await seedActiveListings(ctx, seller.userId, 1, { category: 'cours-particuliers', title: () => 'Cours de maths' });
      await ctx.db.execute(sql`update listings set attributes = '{"rate_unit":"heure"}'::jsonb where id = ${id}`);
      const item = (await call(ctx, 'GET', '/listings')).body.items.find((i: { id: string }) => i.id === id);
      expect(item.priceUnit).toBe('h');
    });

    it('chaque catégorie envoie son formulaire (le terrain n’a ni pièces ni chambres)', async () => {
      const { body } = await call(ctx, 'GET', '/categories');
      const immo = body.categories.find((c: { slug: string }) => c.slug === 'immobilier');
      const keys = (slug: string) => immo.children.find((c: { slug: string }) => c.slug === slug).form.fields.map((f: { key: string }) => f.key);
      expect(keys('terrains')).toEqual(['surface', 'title_deed', 'deal']);
      expect(keys('locations')).toEqual(['property_type', 'rooms', 'bedrooms', 'surface', 'furnished', 'advance_months']);
      expect(immo.children.find((c: { slug: string }) => c.slug === 'locations').form.price.label).toBe('Loyer mensuel');
    });

    it('met en avant les annonces boostées en première page seulement', async () => {
      const [boosted] = await seedActiveListings(ctx, seller.userId, 4);
      await ctx.db.execute(sql`update listings set boost_until = now() + interval '1 day' where id = ${boosted}`);
      const p1 = await call(ctx, 'GET', '/listings?limit=2');
      expect(p1.body.featured.map((i: { id: string }) => i.id)).toEqual([boosted]);
      expect(p1.body.featured[0].boosted).toBe(true);
      const p2 = await call(ctx, 'GET', `/listings?limit=2&cursor=${p1.body.nextCursor}`);
      expect(p2.body.featured).toEqual([]);
    });

    it('envoie des en-têtes de cache publics sur les lectures, privés sur le contact', async () => {
      const [id] = await seedActiveListings(ctx, seller.userId, 1);
      const list = await ctx.app.inject({ method: 'GET', url: '/listings' });
      expect(list.headers['cache-control']).toContain('public');
      const buyer = await login(ctx);
      const contact = await ctx.app.inject({
        method: 'GET',
        url: `/listings/${id}/contact`,
        headers: { authorization: `Bearer ${buyer.accessToken}` },
      });
      expect(contact.headers['cache-control']).toBe('private, no-store');
    });
  });
});
