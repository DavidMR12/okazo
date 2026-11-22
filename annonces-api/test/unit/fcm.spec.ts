import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FcmPushSender as Sender } from '../../src/push/push-sender';

// Compte de service factice : vraie paire de clés RSA, pour vérifier la signature de l'assertion
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const file = join(mkdtempSync(join(tmpdir(), 'fcm-')), 'compte.json');
writeFileSync(
  file,
  JSON.stringify({ project_id: 'okazo-test', client_email: 'push@okazo-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
);

function load(): Sender {
  process.env.PUSH_PROVIDER = 'fcm';
  process.env.FIREBASE_SERVICE_ACCOUNT_FILE = file;
  let s!: Sender;
  jest.isolateModules(() => {
    const { FcmPushSender } = require('../../src/push/push-sender');
    s = new FcmPushSender();
  });
  return s;
}

const msg = (to: string) => ({ to, title: 'Annonce en ligne', body: 'Vélo', data: { url: '/listing/1' } });

describe('Envoi Firebase (FCM)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('signe l’assertion Google, réutilise le jeton, envoie au bon format ; jeton périmé = gone', async () => {
    const calls: Array<[string, RequestInit]> = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'jeton-google', expires_in: 3600 }));
      const to = JSON.parse(String(init.body)).message.token;
      if (to === 'perime') return new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 });
      return new Response(JSON.stringify({ name: 'projects/okazo-test/messages/1' }));
    }) as unknown as typeof fetch;

    const s = load();
    expect(await s.send([msg('bon'), msg('perime')])).toEqual(['ok', 'gone']);
    expect(await s.send([msg('bon')])).toEqual(['ok']);

    const tokenCalls = calls.filter(([u]) => u.includes('oauth2'));
    expect(tokenCalls).toHaveLength(1); // jeton Google gardé une heure
    const assertion = new URLSearchParams(String(tokenCalls[0][1].body)).get('assertion')!;
    const [h, c, sig] = assertion.split('.');
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toMatchObject({
      iss: 'push@okazo-test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    });

    const [url, init] = calls.find(([u]) => u.includes('fcm.googleapis.com'))!;
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/okazo-test/messages:send');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-google');
    expect(JSON.parse(String(init.body)).message).toMatchObject({
      token: 'bon',
      notification: { title: 'Annonce en ligne', body: 'Vélo' },
      data: { url: '/listing/1' },
      android: { priority: 'high', notification: { channel_id: 'default' } },
    });
  });

  it('jeton Google refusé : erreur pour tous, rien ne plante', async () => {
    global.fetch = jest.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    expect(await load().send([msg('a'), msg('b')])).toEqual(['error', 'error']);
  });
});
