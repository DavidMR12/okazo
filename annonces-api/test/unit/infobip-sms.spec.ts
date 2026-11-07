import type { InfobipSmsProvider as Provider } from '../../src/auth/sms/infobip-sms.provider';

// Configuration Infobip posée avant le chargement de src/config/env.ts
function load(): Provider {
  process.env.SMS_PROVIDER = 'infobip';
  process.env.INFOBIP_BASE_URL = 'https://abcd1.api.infobip.com';
  process.env.INFOBIP_API_KEY = 'cle-de-test';
  let provider!: Provider;
  jest.isolateModules(() => {
    const { InfobipSmsProvider } = require('../../src/auth/sms/infobip-sms.provider');
    provider = new InfobipSmsProvider();
  });
  return provider;
}

describe('Envoi de SMS par Infobip', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  const reply = (status: number, body: unknown) =>
    jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('envoie le message au bon format', async () => {
    const fetchMock = reply(200, { messages: [{ status: { groupName: 'PENDING' } }] });
    global.fetch = fetchMock;
    await load().send('+237699000001', 'Votre code : 123456');
    const [url, init] = (fetchMock as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe('https://abcd1.api.infobip.com/sms/2/text/advanced');
    expect(init.headers.Authorization).toBe('App cle-de-test');
    expect(JSON.parse(init.body)).toEqual({
      messages: [{ from: 'Okazo', destinations: [{ to: '237699000001' }], text: 'Votre code : 123456' }],
    });
  });

  it('signale un message refusé malgré une réponse 200', async () => {
    global.fetch = reply(200, { messages: [{ status: { groupName: 'REJECTED' } }] });
    await expect(load().send('+237699000001', 'x')).rejects.toThrow('REJECTED');
  });

  it("signale une erreur HTTP (clé invalide…)", async () => {
    global.fetch = reply(401, { requestError: {} });
    await expect(load().send('+237699000001', 'x')).rejects.toThrow('HTTP 401');
  });
});
