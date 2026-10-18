/** Candidatures aux offres d'emploi : types et libellés des statuts, communs aux pages du site. */
export type ApplicationStatus = 'sent' | 'viewed' | 'shortlisted' | 'rejected';

export interface MyApplication {
  id: string;
  listingId: string;
  listingTitle: string;
  listingStatus: string;
  status: ApplicationStatus;
  hasCv: boolean;
  conversationId: string | null;
  createdAt: string;
}

export interface ReceivedApplication {
  id: string;
  status: ApplicationStatus;
  message: string;
  hasCv: boolean;
  cvContentType: string | null;
  conversationId: string | null;
  createdAt: string;
  applicant: { id: string; displayName: string; verificationLevel: 'phone' | 'identity'; memberSince: string };
}

/** Statut vu par le candidat. */
export const CANDIDATE_STATUS: Record<ApplicationStatus, { label: string; className: string }> = {
  sent: { label: 'Envoyée', className: 'badge-blue' },
  viewed: { label: 'Vue par le recruteur', className: 'badge-blue' },
  shortlisted: { label: 'Retenue', className: 'badge-green' },
  rejected: { label: 'Non retenue', className: 'badge-grey' },
};

/** Statut vu par le recruteur. */
export const EMPLOYER_STATUS: Record<ApplicationStatus, { label: string; className: string }> = {
  sent: { label: 'Nouvelle', className: 'badge-blue' },
  viewed: { label: 'À trier', className: 'badge-grey' },
  shortlisted: { label: 'Retenue', className: 'badge-green' },
  rejected: { label: 'Écartée', className: 'badge-grey' },
};

export const CV_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const CV_MAX_BYTES = 5_000_000;
