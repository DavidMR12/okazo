import type { MessageFlag } from '../api/types';

/** Avertissements affichés au destinataire, sous le message concerné. */
export const MESSAGE_WARNINGS: Record<MessageFlag, string> = {
  advance_payment: "Ce message demande un paiement à l’avance. Ne payez jamais avant d’avoir vu l’article.",
  money_transfer: "Transfert d’argent à distance : c’est la méthode préférée des arnaqueurs. Payez en main propre.",
  link: "Ce message contient un lien. N’y saisissez jamais vos codes Mobile Money ou bancaires.",
  code_request: "Ne donnez jamais un code reçu par SMS : il permet de pirater votre compte.",
};
