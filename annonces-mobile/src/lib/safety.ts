/**
 * Conseils de sécurité affichés sur l'annonce, selon la catégorie : c'est au moment du contact
 * que l'arnaque se joue, et elle n'a pas la même forme pour un objet, un emploi ou un service.
 */
export function safetyTips(parentSlug: string | null | undefined): { title: string; lines: string[] } {
  if (parentSlug === 'emploi') {
    return {
      title: 'Avant de postuler',
      lines: [
        'Un vrai employeur ne demande jamais d’argent : ni frais de dossier, ni formation, ni uniforme payants.',
        'Rencontrez l’employeur de jour, dans ses locaux ou dans un lieu public.',
        'Ne communiquez jamais vos codes Mobile Money ou bancaires, ni le code reçu par SMS.',
      ],
    };
  }
  if (parentSlug === 'services') {
    return {
      title: 'Avant de payer',
      lines: [
        'Ne payez pas tout d’avance : réglez la prestation une fois faite, ou par étapes.',
        'Convenez du prix et de ce qui est inclus par écrit, dans la messagerie.',
        'Après un paiement Mobile Money, vérifiez votre solde dans l’application de l’opérateur : un SMS de confirmation peut être faux.',
      ],
    };
  }
  return {
    title: 'Avant de payer',
    lines: [
      'Ne payez jamais à l’avance, ni acompte ni frais de dossier.',
      'Rencontrez le vendeur dans un lieu public et vérifiez l’article avant de payer.',
      'Après un paiement Mobile Money, vérifiez votre solde dans l’application de l’opérateur : un SMS de confirmation peut être faux.',
    ],
  };
}
