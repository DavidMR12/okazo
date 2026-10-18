/**
 * Signaux d'arnaque dans les messages. Ils ne bloquent rien : ils déclenchent un avertissement
 * affiché au DESTINATAIRE sous le message concerné, au moment précis où l'arnaque se joue.
 */
export type MessageFlag = 'advance_payment' | 'money_transfer' | 'link' | 'code_request';

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'");

const RULES: { flag: MessageFlag; re: RegExp }[] = [
  {
    flag: 'advance_payment',
    re: /\b(acompte|a l'avance|d'avance|payer avant|paiement avant|frais de (livraison|dossier|transport|douane|reservation|deplacement))\b/,
  },
  { flag: 'money_transfer', re: /\b(western union|moneygram|code de retrait)\b/ },
  {
    flag: 'link',
    re: /(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(com|net|org|info|xyz|biz|top|site|online|link|ly|me|co)\b/,
  },
  // « Envoie-moi le code que tu viens de recevoir » : vol de compte WhatsApp ou Mobile Money
  { flag: 'code_request', re: /\b(code (otp|secret|de verification|de confirmation|recu|que tu as recu|que vous avez recu)|ton code|votre code)\b/ },
];

export function scanMessage(body: string): MessageFlag[] {
  const text = normalize(body);
  return RULES.filter((r) => r.re.test(text)).map((r) => r.flag);
}
