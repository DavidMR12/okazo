import { activate, call, cityId, createListing, createTestApp, Ctx, listingBody, login, resetState, Session } from '../helpers';

describe('Quartier dans la localisation', () => {
  let ctx: Ctx;
  let seller: Session;
  let douala: number;
  let yaounde: number;
  let akwa: number;
  let bonapriso: number;
  let bastos: number;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    seller = await login(ctx);
    [douala, yaounde] = [await cityId(ctx, 'douala'), await cityId(ctx, 'yaounde')];
    const d = (await call(ctx, 'GET', `/geo/districts?cityId=${douala}`)).body.districts as { id: number; slug: string }[];
    akwa = d.find((x) => x.slug === 'akwa')!.id;
    bonapriso = d.find((x) => x.slug === 'bonapriso')!.id;
    bastos = ((await call(ctx, 'GET', `/geo/districts?cityId=${yaounde}`)).body.districts as { id: number; slug: string }[]).find((x) => x.slug === 'bastos')!.id;
  });

  it('liste les quartiers d’une ville, par ordre alphabétique', async () => {
    const res = await call(ctx, 'GET', `/geo/districts?cityId=${douala}`);
    expect(res.status).toBe(200);
    const names = res.body.districts.map((d: { name: string }) => d.name);
    expect(names).toContain('Akwa');
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));
    expect((await call(ctx, 'GET', '/geo/districts')).status).toBe(400);
  });

  it('le quartier, facultatif, s’affiche avec la ville et sert de filtre', async () => {
    const withDistrict = await createListing(ctx, seller, { districtId: akwa, title: 'Canapé trois places, Akwa' });
    const without = await createListing(ctx, seller, { title: 'Table basse en bois' });
    await activate(ctx, withDistrict);
    await activate(ctx, without);

    const detail = (await call(ctx, 'GET', `/listings/${withDistrict}`)).body;
    expect(detail).toMatchObject({ city: 'Douala', district: 'Akwa' });
    expect((await call(ctx, 'GET', `/listings/${without}`)).body.district).toBeNull();

    const all = (await call(ctx, 'GET', `/listings?cityId=${douala}`)).body.items;
    expect(all.find((i: { id: string }) => i.id === withDistrict).district).toBe('Akwa');
    const filtered = (await call(ctx, 'GET', `/listings?districtId=${akwa}`)).body.items;
    expect(filtered.map((i: { id: string }) => i.id)).toEqual([withDistrict]);
    expect((await call(ctx, 'GET', `/listings/count?districtId=${akwa}`)).body.count).toBe(1);
  });

  it('refuse un quartier d’une autre ville', async () => {
    const res = await call(ctx, 'POST', '/listings', {
      token: seller.accessToken,
      body: await listingBody(ctx, seller, { districtId: bastos }), // Bastos est à Yaoundé, l'annonce à Douala
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DISTRICT_INVALID');
  });

  it('modifier : changer de quartier, le retirer ; changer de ville retire le quartier', async () => {
    const id = await createListing(ctx, seller, { districtId: akwa });
    await activate(ctx, id);
    const edit = (body: Record<string, unknown>) => call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body });
    const mine = async () => (await call(ctx, 'GET', `/me/listings/${id}`, { token: seller.accessToken })).body;

    expect((await edit({ districtId: bonapriso })).status).toBe(200);
    expect((await mine()).districtId).toBe(bonapriso);
    await activate(ctx, id);
    expect((await edit({ districtId: null })).status).toBe(200);
    expect((await mine()).districtId).toBeNull();

    await activate(ctx, id);
    await edit({ districtId: akwa });
    await activate(ctx, id);
    expect((await edit({ cityId: yaounde })).status).toBe(200);
    expect(await mine()).toMatchObject({ cityId: yaounde, districtId: null });
    await activate(ctx, id);
    expect((await edit({ districtId: akwa })).body.code).toBe('DISTRICT_INVALID'); // Akwa n'est pas à Yaoundé
  });
});
