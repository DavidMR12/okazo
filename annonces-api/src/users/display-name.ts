import { BadRequestException } from '@nestjs/common';
import { env } from '../config/env';

// Lettres (accents compris), chiffres, espaces, point, apostrophe, tiret
export const NAME_RE = /^[\p{L}\p{M}0-9 .'’-]+$/u;

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Noms interdits : l'usurpation du « service client » ou de l'équipe de modération est une arnaque classique
 * (« Support <marque> : payez les frais de livraison ici »). « <marque> Support », « Équipe <marque> »… sont bloqués par les mots ci-dessous.
 */
const RESERVED = [
  'admin', 'administrateur', 'administration', 'moderateur', 'moderation', 'support', 'service client',
  'assistance', 'officiel', 'official', 'staff', 'equipe', 'securite', 'verification',
];

/**
 * Nom de la marque (APP_NAME) : interdit SEUL, car un compte portant ce nom passerait pour officiel.
 * Autorisé dans un nom complet, car une marque peut aussi être un nom de famille (« Jean Laba » doit pouvoir s'inscrire).
 */
const BRAND_EXACT = [normalize(env.APP_NAME)];

function nameProblem(name: string): 'NAME_HAS_PHONE' | 'NAME_RESERVED' | null {
  const n = normalize(name);
  // Un numéro de téléphone dans le nom sert à contourner les limites de consultation des contacts
  if ((name.match(/\d/g) ?? []).length > 4) return 'NAME_HAS_PHONE';
  if (BRAND_EXACT.includes(n) || RESERVED.some((r) => n === r || n.startsWith(`${r} `) || n.endsWith(` ${r}`) || n.includes(` ${r} `))) return 'NAME_RESERVED';
  return null;
}

/** Même règle à l'inscription et au changement de nom. */
export function assertAcceptableName(name: string) {
  const problem = nameProblem(name);
  if (problem === 'NAME_HAS_PHONE') throw new BadRequestException({ code: problem, message: 'Le nom ne doit pas contenir de numéro.' });
  if (problem) throw new BadRequestException({ code: problem, message: "Ce nom n'est pas autorisé." });
}

/** Nom lu chez Google ou Facebook : un nom refusé ne bloque pas la connexion, il est remplacé. */
export function safeProfileName(name: string | null | undefined): string {
  const n = (name ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return n.length >= 2 && NAME_RE.test(n) && !nameProblem(n) ? n : 'Utilisateur';
}
