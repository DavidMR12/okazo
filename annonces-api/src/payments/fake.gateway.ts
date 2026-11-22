import { CheckoutRequest, PaymentGateway, PaymentState } from './payment-gateway';

/**
 * Paiement simulé (développement et tests, interdit en production) : la « page de paiement » renvoie tout de suite
 * vers le site, et le paiement est réussi. setNext() permet aux tests de choisir l'issue suivante.
 */
export class FakeGateway implements PaymentGateway {
  readonly name = 'fake';
  private readonly known = new Map<string, number>();
  private readonly forced = new Map<string, PaymentState>();
  next: PaymentState['state'] = 'completed';

  async startCheckout(req: CheckoutRequest) {
    this.known.set(req.paymentId, req.amountXaf);
    if (this.next !== 'completed') this.forced.set(req.paymentId, this.stateFor(this.next));
    const url = new URL(req.returnUrl);
    url.searchParams.set('depositId', req.paymentId);
    return { redirectUrl: url.toString() };
  }

  /** Pour les tests : impose l'état lu pour un paiement. */
  set(paymentId: string, state: PaymentState) {
    this.forced.set(paymentId, state);
  }

  async status(paymentId: string): Promise<PaymentState> {
    const forced = this.forced.get(paymentId);
    if (forced) return forced;
    const amount = this.known.get(paymentId);
    if (amount === undefined) return { state: 'not_found' };
    return { state: 'completed', amountXaf: amount, currency: 'XAF', providerTxId: `FAKE-${paymentId.slice(0, 8)}` };
  }

  private stateFor(s: PaymentState['state']): PaymentState {
    if (s === 'failed') return { state: 'failed', failureCode: 'INSUFFICIENT_BALANCE' };
    if (s === 'pending') return { state: 'pending' };
    return { state: 'not_found' };
  }
}
