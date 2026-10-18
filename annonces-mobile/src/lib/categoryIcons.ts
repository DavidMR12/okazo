import type { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

/** Icône bleue de chaque catégorie principale (grille de l'accueil, liste des catégories). */
const ICONS: Record<string, IconName> = {
  vehicules: 'car-sport',
  immobilier: 'home',
  emploi: 'briefcase',
  services: 'construct',
  electronique: 'phone-portrait',
  maison: 'bed',
  mode: 'shirt',
  'bebe-enfant': 'happy',
  animaux: 'paw',
  loisirs: 'football',
  'materiel-pro': 'hammer',
};

export const categoryIcon = (slug: string): IconName => ICONS[slug] ?? 'pricetag';

/** Les 7 catégories de la grille d'accueil (la 8e tuile, « Autres », ouvre la liste complète). */
export const HOME_GRID = ['vehicules', 'immobilier', 'electronique', 'maison', 'mode', 'services', 'emploi'];
