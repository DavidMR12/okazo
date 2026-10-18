export type AdType = 'offer' | 'request';

/** Libellés « Je propose / Je recherche » selon la catégorie principale, comme sur LeBonCoin. */
export function adTypeLabels(parentSlug?: string): Record<AdType, string> {
  switch (parentSlug) {
    case 'emploi':
      return { offer: 'Je recrute', request: 'Je cherche un emploi' };
    case 'services':
      return { offer: 'Je propose un service', request: 'Je cherche un prestataire' };
    case 'immobilier':
      return { offer: 'Je vends ou je loue', request: 'Je cherche un bien' };
    default:
      return { offer: 'Je vends', request: 'Je recherche' };
  }
}

/** Exemple de titre adapté à la catégorie. */
export function titlePlaceholder(parentSlug: string | undefined, adType: AdType): string {
  if (parentSlug === 'emploi') return adType === 'offer' ? 'Ex. : Vendeuse en boutique, Akwa' : 'Ex. : Chauffeur avec permis B cherche un poste';
  if (parentSlug === 'services') return adType === 'offer' ? 'Ex. : Cours de maths à domicile, collège et lycée' : 'Ex. : Cherche électricien pour une installation';
  return adType === 'offer' ? 'Ex. : Samsung Galaxy A15, 128 Go, bleu' : 'Ex. : Cherche iPhone 12 en bon état';
}

/** Exemple de description adapté à la catégorie. */
export function descriptionPlaceholder(parentSlug: string | undefined, adType: AdType): string {
  if (parentSlug === 'emploi') return adType === 'offer' ? 'Missions, horaires, profil recherché, comment postuler…' : 'Votre expérience, vos compétences, vos disponibilités…';
  if (parentSlug === 'services') return adType === 'offer' ? 'Ce que vous proposez, votre expérience, vos horaires…' : 'Ce dont vous avez besoin, où et quand…';
  return adType === 'offer' ? 'État, ancienneté, accessoires fournis, raison de la vente…' : 'Ce que vous cherchez, l’état souhaité, votre budget…';
}

// Comme sur LeBonCoin : une offre d'emploi ou un service se publie sans photo (même règle que l'API)
export const PHOTO_OPTIONAL_PARENTS = ['emploi', 'services'];
