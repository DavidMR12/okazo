import type { ApplicationStatus } from '../api/types';
import { colors } from '../theme';

/** Statut vu par le candidat (« Mes candidatures »). */
export const CANDIDATE_STATUS: Record<ApplicationStatus, { label: string; color: string; bg: string }> = {
  sent: { label: 'Envoyée', color: colors.primary, bg: colors.tint },
  viewed: { label: 'Vue par le recruteur', color: colors.primary, bg: colors.tint },
  shortlisted: { label: 'Retenue', color: colors.trust, bg: '#E3F3EA' },
  rejected: { label: 'Non retenue', color: colors.inkMuted, bg: colors.surface },
};

/** Statut vu par le recruteur (candidatures reçues). */
export const EMPLOYER_STATUS: Record<ApplicationStatus, { label: string; color: string; bg: string }> = {
  sent: { label: 'Nouvelle', color: colors.primary, bg: colors.tint },
  viewed: { label: 'À trier', color: colors.inkMuted, bg: colors.surface },
  shortlisted: { label: 'Retenue', color: colors.trust, bg: '#E3F3EA' },
  rejected: { label: 'Écartée', color: colors.inkMuted, bg: colors.surface },
};
