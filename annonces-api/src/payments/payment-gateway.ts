/**
 * Prestataire de paiement Mobile Money. pawaPay partout (décision du porteur, 22/11/2026) ; CinetPay viendra
 * en plan B pour un pays que pawaPay ne couvre pas, avec une seconde implémentation de cette interface.
 *
 * Règle de sécurité : on ne croit jamais une notification ni un retour du navigateur. Seule la lecture du statut
 * auprès du prestataire, avec notre clé, déclenche la livraison (status()).
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Pays d'Okazo : code ISO 2 (base) → code ISO 3 (pawaPay). Tous en francs CFA (XAF). */
export const PAYMENT_COUNTRIES: Record<string, string> = { CM: 'CMR', GA: 'GAB', CG: 'COG' };

export interface CheckoutRequest {
  paymentId: string; // UUID, sert de depositId : une relance avec le même identifiant ne paie pas deux fois
  amountXaf: number;
  countryCode: string; // ISO 2
  reason: string; // affiché sur la page de paiement (50 caractères au plus)
  returnUrl: string;
}

export type PaymentState =
  | { state: 'completed'; amountXaf: number; currency: string; providerTxId: string | null }
  | { state: 'failed'; failureCode: string }
  | { state: 'pending' }
  | { state: 'not_found' }; // jamais lancé (client parti sans payer) ou inconnu

export interface PaymentGateway {
  readonly name: string;
  /** Page de paiement hébergée par le prestataire (le client y choisit son opérateur et confirme). */
  startCheckout(req: CheckoutRequest): Promise<{ redirectUrl: string }>;
  status(paymentId: string): Promise<PaymentState>;
}
