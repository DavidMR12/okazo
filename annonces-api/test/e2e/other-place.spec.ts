import { sql } from 'drizzle-orm';
import { activate, call, cityId, createListing, createTestApp, Ctx, listingBody, login, resetState, rows, Session } from '../helpers';

describe('Ville et quartier hors liste', () => {
  let ctx: Ctx;
  let seller: Session;
  let douala: number;
  let other: number;
  let akwa: number;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    seller = await login(ctx);
    douala = await cityId(ctx, 'douala');
    [{ id: other }] = await rows<{ id: number }>(ctx, sql`select id from cities where country_code = 'CM' and slug = 'autre'`);
    akwa = ((await call(ctx, 'GET', `/geo/districts?cityId=${douala}`)).body.districts as { id: number; slug: string }[]).find((d) => d.slug === 'akwa')!.id;
  });

  const post = async (overrides: Record<string, unknown>) =>
    call(ctx, 'POST', '/listings', { token: seller.accessToken, body: await listingBody(ctx, seller, overrides) });

  it('« Autres villes » est proposée en dernier dans la liste des villes du pays', async () => {
    const list = (await call(ctx, 'GET', '/geo/cities?country=CM')).body.cities as { slug: string; name: string }[];
    expect(list[list.length - 1]).toMatchObject({ slug: 'autre', name: 'Autres villes' });
  });

  it('ville saisie : obligatoire avec « Autres villes », affichée à la place, et filtrable', async () => {
    expect((await post({ cityId: other })).body.code).toBe('CITY_NAME_REQUIRED');

    const id = await createListing(ctx, seller, { cityId: other, cityOther: 'Kribi', districtOther: 'Mpangou' });
    await activate(ctx, id);
    const detail = (await call(ctx, 'GET', `/listings/${id}`)).body;
    expect(detail).toMatchObject({ city: 'Kribi', district: 'Mpangou' });
    const items = (await call(ctx, 'GET', `/listings?cityId=${other}`)).body.items as { id: string; city: string }[];
    expect(items).toEqual([expect.objectContaining({ id, city: 'Kribi' })]);
  });

  it('quartier saisi pour une ville de la liste ; ignoré si un quartier de la liste est choisi', async () => {
    const free = await createListing(ctx, seller, { cityId: douala, districtOther: 'Ndogpassi' });
    const listed = await createListing(ctx, seller, { cityId: douala, districtId: akwa, districtOther: 'Ndogpassi' });
    const named = await createListing(ctx, seller, { cityId: douala, cityOther: 'Kribi' });
    for (const id of [free, listed, named]) await activate(ctx, id);
    expect((await call(ctx, 'GET', `/listings/${free}`)).body).toMatchObject({ city: 'Douala', district: 'Ndogpassi' });
    expect((await call(ctx, 'GET', `/listings/${listed}`)).body).toMatchObject({ district: 'Akwa' });
    expect((await call(ctx, 'GET', `/listings/${named}`)).body.city).toBe('Douala'); // nom saisi ignoré hors « Autres villes »
  });

  it('refuse les chiffres (numéro caché) et les noms trop courts', async () => {
    expect((await post({ cityId: other, cityOther: 'Kribi 690000000' })).status).toBe(400);
    expect((await post({ cityId: douala, districtOther: 'A' })).status).toBe(400);
  });

  it('modifier : passer à une ville de la liste efface le nom saisi', async () => {
    const id = await createListing(ctx, seller, { cityId: other, cityOther: 'Kribi', districtOther: 'Mpangou' });
    await activate(ctx, id);
    const edit = (body: Record<string, unknown>) => call(ctx, 'PATCH', `/listings/${id}`, { token: seller.accessToken, body });
    const mine = async () => (await call(ctx, 'GET', `/me/listings/${id}`, { token: seller.accessToken })).body;

    expect((await edit({ title: 'Nouveau titre de l’annonce' })).status).toBe(200);
    expect(await mine()).toMatchObject({ cityOther: 'Kribi', districtOther: 'Mpangou' }); // gardés
    await activate(ctx, id);
    expect((await edit({ cityId: douala })).status).toBe(200);
    expect(await mine()).toMatchObject({ cityId: douala, cityOther: null, districtOther: null });
  });
});
