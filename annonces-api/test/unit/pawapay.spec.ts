import type { PawapayGateway as Gateway } from '../../src/payments/pawapay.gateway';

// Configuration pawaPay posée avant le chargement de src/config/env.ts
function load(): Gateway {
  process.env.PAYMENT_PROVIDER = 'pawapay';
  process.env.PAWAPAY_ENV = 'sandbox';
  process.env.PAWAPAY_API_TOKEN = 'jeton-de-test';
  process.env.PAYMENT_RETURN_URL = 'https://okazo.org/paiement/retour';
  let g!: Gateway;
  jest.isolateModules(() => {
    const { PawapayGateway } = require('../../src/payments/pawapay.gateway');
    g = new PawapayGateway();
  });
  return g;
}

const ID = '8917c345-4791-4285-a416-62f24b6982db';

describe('Client pawaPay', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const reply = (status: number, body: unknown) =>
    jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('ouvre la page de paiement au bon format', async () => {
    const f = reply(200, { redirectUrl: 'https://paywith.pawapay.io/?token=abc' });
    global.fetch = f;
    const r = await load().startCheckout({ paymentId: ID, amountXaf: 2000, countryCode: 'GA', reason: 'À la une 7 jours', returnUrl: 'https://okazo.org/paiement/retour' });
    expect(r.redirectUrl).toBe('https://paywith.pawapay.io/?token=abc');
    const [url, init] = (f as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.sandbox.pawapay.io/v2/paymentpage');
    expect(init.headers.Authorization).toBe('Bearer jeton-de-test');
    expect(JSON.parse(init.body)).toEqual({
      depositId: ID,
      returnUrl: 'https://okazo.org/paiement/retour',
      amountDetails: { amount: '2000', currency: 'XAF' },
      country: 'GAB',
      language: 'FR',
      reason: 'À la une 7 jours',
      customerMessage: 'Okazo A la une',
    });
  });

  it('refuse une réponse sans adresse https', async () => {
    global.fetch = reply(400, { failureReason: { failureCode: 'INVALID_PARAMETER' } });
    await expect(load().startCheckout({ paymentId: ID, amountXaf: 1, countryCode: 'CM', reason: 'x', returnUrl: 'https://okazo.org' })).rejects.toThrow();
  });

  it('lit les statuts', async () => {
    const g = load();
    global.fetch = reply(200, { status: 'FOUND', data: { depositId: ID, status: 'COMPLETED', amount: '2000.00', currency: 'XAF', providerTransactionId: '123' } });
    expect(await g.status(ID)).toEqual({ state: 'completed', amountXaf: 2000, currency: 'XAF', providerTxId: '123' });
    global.fetch = reply(200, { status: 'FOUND', data: { depositId: ID, status: 'FAILED', failureReason: { failureCode: 'INSUFFICIENT_BALANCE' } } });
    expect(await g.status(ID)).toEqual({ state: 'failed', failureCode: 'INSUFFICIENT_BALANCE' });
    global.fetch = reply(200, { status: 'FOUND', data: { depositId: ID, status: 'IN_RECONCILIATION' } });
    expect(await g.status(ID)).toEqual({ state: 'pending' });
    global.fetch = reply(200, { status: 'NOT_FOUND' });
    expect(await g.status(ID)).toEqual({ state: 'not_found' });
    // Erreur du prestataire : jamais « échoué », on relira
    global.fetch = reply(500, { failureReason: { failureCode: 'UNKNOWN_ERROR' } });
    expect(await g.status(ID)).toEqual({ state: 'pending' });
    // Réponse pour un autre paiement : ignorée
    global.fetch = reply(200, { status: 'FOUND', data: { depositId: 'autre', status: 'COMPLETED', amount: '2000', currency: 'XAF' } });
    expect(await g.status(ID)).toEqual({ state: 'pending' });
  });
});
