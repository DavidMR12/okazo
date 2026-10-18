'use client';

/**
 * Reprise automatique après connexion : l'action voyage dans l'adresse de retour
 * (`/annonce/…?action=whatsapp`), puis est retirée de l'adresse une fois exécutée.
 */
export type ResumeAction = 'whatsapp' | 'numero' | 'favori';

export const withAction = (path: string, action: ResumeAction) => `${path}${path.includes('?') ? '&' : '?'}action=${action}`;

export function takeResumeAction(expected: ResumeAction[]): ResumeAction | null {
  const url = new URL(window.location.href);
  const a = url.searchParams.get('action') as ResumeAction | null;
  if (!a || !expected.includes(a)) return null;
  url.searchParams.delete('action');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  return a;
}
