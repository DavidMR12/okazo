import { bed, briefcase, carSport, construct, ellipsisHorizontal, football, grid, hammer, happy, home, paw, phonePortrait, pricetag, shirt } from 'ionicons/icons';
import { Ion } from './Ion';

/** Icônes pleines des catégories principales : exactement celles de l'application (Ionicons). */
const ICONS: Record<string, string> = {
  vehicules: carSport,
  immobilier: home,
  emploi: briefcase,
  services: construct,
  electronique: phonePortrait,
  maison: bed,
  mode: shirt,
  'bebe-enfant': happy,
  animaux: paw,
  loisirs: football,
  'materiel-pro': hammer,
  toutes: grid,
  autres: ellipsisHorizontal,
};

export function CategoryIcon({ slug, size = 30 }: { slug: string; size?: number }) {
  return <Ion icon={ICONS[slug] ?? pricetag} size={size} />;
}
