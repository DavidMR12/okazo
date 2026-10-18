import { sql } from 'drizzle-orm';
import { call, createTestApp, Ctx, login, resetState, rows, seedActiveListings, Session } from '../helpers';

describe('Candidatures aux offres d’emploi', () => {
  let ctx: Ctx;
  let employer: Session;
  let candidate: Session;
  let other: Session;
  let job: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    [employer, candidate, other] = [await login(ctx), await login(ctx), await login(ctx)];
    // « Petits boulots » : catégorie Emploi sans identité exigée, pratique pour créer l'offre directement en base
    [job] = await seedActiveListings(ctx, employer.userId, 1, { category: 'petits-boulots', title: () => 'Livreur à moto, Akwa' });
  });

  const MESSAGE = 'Bonjour, j’ai trois ans d’expérience comme livreur à Douala et mon permis A.';

  /** Comme un client : demande l'URL d'envoi du CV, puis « envoie » le fichier. */
  const uploadCv = async (s: Session, listingId = job, contentType = 'application/pdf', body = Buffer.from('%PDF-1.4 CV de test')) => {
    const res = await call(ctx, 'POST', `/listings/${listingId}/applications/cv-upload-url`, { token: s.accessToken, body: { contentType, sizeBytes: body.length } });
    expect(res.status).toBe(201);
    ctx.storage.put(res.body.key, body, contentType);
    return res.body.key as string;
  };
  const apply = (s: Session, body: Record<string, unknown>, listingId = job) =>
    call(ctx, 'POST', `/listings/${listingId}/applications`, { token: s.accessToken, body });

  it('envoie la candidature avec un CV et ouvre une conversation avec le recruteur', async () => {
    const cvKey = await uploadCv(candidate);
    const res = await apply(candidate, { message: MESSAGE, cvKey });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('sent');

    // Le message arrive dans la messagerie du recruteur
    const inbox = (await call(ctx, 'GET', '/conversations', { token: employer.accessToken })).body;
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0].id).toBe(res.body.conversationId);
    const conv = (await call(ctx, 'GET', `/conversations/${res.body.conversationId}`, { token: employer.accessToken })).body;
    expect(conv.messages[0].body).toBe(`Candidature (CV joint)\n\n${MESSAGE}`);

    // Le candidat la retrouve dans « Mes candidatures »
    const mine = (await call(ctx, 'GET', '/me/applications', { token: candidate.accessToken })).body.items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ listingId: job, listingTitle: 'Livreur à moto, Akwa', status: 'sent', hasCv: true });
    const forJob = (await call(ctx, 'GET', `/me/applications?listingId=${job}`, { token: candidate.accessToken })).body.items;
    expect(forJob).toHaveLength(1);
  });

  it('le recruteur voit les candidatures, lit le CV et retient ou écarte ; le candidat suit le statut', async () => {
    const cvKey = await uploadCv(candidate);
    const { body: a } = await apply(candidate, { message: MESSAGE, cvKey });

    // Compteurs dans « Mes annonces »
    let my = (await call(ctx, 'GET', '/me/listings', { token: employer.accessToken })).body.items;
    expect(my[0]).toMatchObject({ id: job, applications: 1, newApplications: 1 });

    const list = await call(ctx, 'GET', `/me/listings/${job}/applications`, { token: employer.accessToken });
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ id: a.id, message: MESSAGE, hasCv: true, cvContentType: 'application/pdf', applicant: { id: candidate.userId } });

    // Ouvrir la liste vaut lecture
    my = (await call(ctx, 'GET', '/me/listings', { token: employer.accessToken })).body.items;
    expect(my[0].newApplications).toBe(0);
    let mine = (await call(ctx, 'GET', '/me/applications', { token: candidate.accessToken })).body.items;
    expect(mine[0].status).toBe('viewed');

    const cv = await call(ctx, 'GET', `/me/applications/${a.id}/cv`, { token: employer.accessToken });
    expect(cv.status).toBe(200);
    expect(cv.body).toMatchObject({ url: `memory://download/${cvKey}`, contentType: 'application/pdf', expiresInSec: 300 });

    expect((await call(ctx, 'PATCH', `/me/applications/${a.id}`, { token: employer.accessToken, body: { status: 'shortlisted' } })).status).toBe(200);
    mine = (await call(ctx, 'GET', '/me/applications', { token: candidate.accessToken })).body.items;
    expect(mine[0].status).toBe('shortlisted');
  });

  it('protège le CV et les candidatures : seul le recruteur y a accès', async () => {
    const { body: a } = await apply(candidate, { message: MESSAGE, cvKey: await uploadCv(candidate) });
    for (const s of [candidate, other]) {
      expect((await call(ctx, 'GET', `/me/applications/${a.id}/cv`, { token: s.accessToken })).status).toBe(404);
      expect((await call(ctx, 'GET', `/me/listings/${job}/applications`, { token: s.accessToken })).status).toBe(404);
      expect((await call(ctx, 'PATCH', `/me/applications/${a.id}`, { token: s.accessToken, body: { status: 'rejected' } })).status).toBe(404);
    }
    expect((await call(ctx, 'GET', `/me/applications/${a.id}/cv`)).status).toBe(401);
  });

  it('refuse le CV d’un autre, un fichier absent ou d’un format non accepté', async () => {
    const othersCv = await uploadCv(other);
    expect((await apply(candidate, { message: MESSAGE, cvKey: othersCv })).body.code).toBe('FILE_KEY_INVALID');

    const res = await call(ctx, 'POST', `/listings/${job}/applications/cv-upload-url`, { token: candidate.accessToken, body: { contentType: 'application/pdf', sizeBytes: 1000 } });
    expect((await apply(candidate, { message: MESSAGE, cvKey: res.body.key })).body.code).toBe('FILE_NOT_UPLOADED');

    // Type annoncé « PDF », fichier réellement envoyé autrement : le type enregistré par le stockage fait foi
    const key = await uploadCv(candidate, job, 'application/pdf');
    ctx.storage.put(key, Buffer.from('MZ exécutable'), 'application/x-msdownload');
    expect((await apply(candidate, { message: MESSAGE, cvKey: key })).body.code).toBe('FILE_TYPE');

    const word = await call(ctx, 'POST', `/listings/${job}/applications/cv-upload-url`, { token: candidate.accessToken, body: { contentType: 'application/msword', sizeBytes: 1000 } });
    expect(word.status).toBe(400);
    const big = await call(ctx, 'POST', `/listings/${job}/applications/cv-upload-url`, { token: candidate.accessToken, body: { contentType: 'application/pdf', sizeBytes: 6_000_000 } });
    expect(big.status).toBe(400);
  });

  it('une seule candidature par offre ; message trop court refusé ; CV facultatif', async () => {
    expect((await apply(candidate, { message: 'Bonjour' })).status).toBe(400);
    const first = await apply(candidate, { message: MESSAGE });
    expect(first.status).toBe(201);
    const conv = (await call(ctx, 'GET', `/conversations/${first.body.conversationId}`, { token: employer.accessToken })).body;
    expect(conv.messages[0].body).toBe(`Candidature\n\n${MESSAGE}`);
    const again = await apply(candidate, { message: MESSAGE });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_APPLIED');
  });

  it('on ne postule qu’à une offre d’emploi en ligne, et pas à la sienne', async () => {
    const [phone] = await seedActiveListings(ctx, employer.userId, 1, { category: 'telephones' });
    expect((await apply(candidate, { message: MESSAGE }, phone)).body.code).toBe('NOT_A_JOB_OFFER');

    // « Je recherche un emploi » : on ne postule pas à une demande
    await ctx.db.execute(sql`update listings set ad_type = 'request' where id = ${job}`);
    expect((await apply(candidate, { message: MESSAGE })).body.code).toBe('NOT_A_JOB_OFFER');
    await ctx.db.execute(sql`update listings set ad_type = 'offer' where id = ${job}`);

    expect((await apply(employer, { message: MESSAGE })).body.code).toBe('OWN_LISTING');

    await ctx.db.execute(sql`update listings set status = 'sold' where id = ${job}`);
    expect((await apply(candidate, { message: MESSAGE })).status).toBe(404);
  });

  it('supprimer son compte efface ses candidatures et ses CV', async () => {
    const cvKey = await uploadCv(candidate);
    await apply(candidate, { message: MESSAGE, cvKey });
    expect(ctx.storage.files.has(cvKey)).toBe(true);

    await ctx.redis.del(`rl:otp:cooldown:${candidate.phone}`);
    expect((await call(ctx, 'POST', '/me/delete/request', { token: candidate.accessToken })).status).toBe(200);
    const del = await call(ctx, 'DELETE', '/me', { token: candidate.accessToken, body: { code: ctx.sms.lastCode(candidate.phone) } });
    expect(del.status).toBe(204);
    expect(ctx.storage.files.has(cvKey)).toBe(false);
    expect(await rows(ctx, sql`select id from job_applications where applicant_id = ${candidate.userId}`)).toHaveLength(0);
  });
});
