import { Logger } from '@nestjs/common';
import { env } from '../config/env';
import { CheckoutRequest, PAYMENT_COUNTRIES, PaymentGateway, PaymentState } from './payment-gateway';

const BASE = { sandbox: 'https://api.sandbox.pawapay.io', production: 'https://api.pawapay.io' } as const;

/**
 * pawaPay, API v2 (https://docs.pawapay.io/v2). Encaissement par la page de paiement hébergée (POST /v2/paymentpage) :
 * pawaPay affiche les opérateurs du pays (MTN, Orange, Airtel, Moov), demande le numéro et envoie la demande de code
 * au téléphone du client. Le statut se lit par GET /v2/deposits/{depositId}.
 */
export class PawapayGateway implements PaymentGateway {
  readonly name = 'pawapay';
  private readonly log = new Logger(PawapayGateway.name);
  private readonly base = BASE[env.PAWAPAY_ENV];

  private async request(method: 'GET' | 'POST', path: string, body?: unknown) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.PAWAPAY_API_TOKEN}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => null)) as Record<string, any> | null;
    return { status: res.status, data };
  }

  async startCheckout(req: CheckoutRequest) {
    const country = PAYMENT_COUNTRIES[req.countryCode];
    if (!country) throw new Error(`Pays non couvert : ${req.countryCode}`);
    const { status, data } = await this.request('POST', '/v2/paymentpage', {
      depositId: req.paymentId,
      returnUrl: req.returnUrl,
      amountDetails: { amount: String(req.amountXaf), currency: 'XAF' },
      country,
      language: 'FR',
      reason: req.reason.slice(0, 50),
      customerMessage: 'Okazo A la une', // 4 à 22 caractères, lettres et chiffres seulement
    });
    if (status !== 200 || typeof data?.redirectUrl !== 'string' || !data.redirectUrl.startsWith('https://')) {
      // Jamais le corps complet dans les journaux : il peut contenir des données du client
      this.log.error(`Page de paiement refusée : HTTP ${status} ${data?.failureReason?.failureCode ?? ''}`);
      throw new Error('PAYMENT_PAGE_FAILED');
    }
    return { redirectUrl: data.redirectUrl as string };
  }

  async status(paymentId: string): Promise<PaymentState> {
    const { status, data } = await this.request('GET', `/v2/deposits/${encodeURIComponent(paymentId)}`);
    // 500 : état inconnu, on relira plus tard (jamais « échoué » sur une erreur du prestataire)
    if (status !== 200 || !data) return { state: 'pending' };
    if (data.status === 'NOT_FOUND') return { state: 'not_found' };
    const d = data.data ?? {};
    if (d.depositId !== paymentId) return { state: 'pending' };
    switch (d.status) {
      case 'COMPLETED': {
        const amount = Number(d.amount);
        return {
          state: 'completed',
          amountXaf: Number.isFinite(amount) ? amount : NaN,
          currency: String(d.currency ?? ''),
          providerTxId: d.providerTransactionId ? String(d.providerTransactionId) : null,
        };
      }
      case 'FAILED':
        return { state: 'failed', failureCode: String(d.failureReason?.failureCode ?? 'UNKNOWN') };
      default: // ACCEPTED, PROCESSING, IN_RECONCILIATION, ou un statut inconnu
        return { state: 'pending' };
    }
  }
}
