'use client';

import { useSyncExternalStore } from 'react';

/** Choix du visiteur : « all » = publicités personnalisées ; « essential » = publicités non personnalisées. */
export type Consent = 'all' | 'essential';
const COOKIE = 'app_consent';
const EVENT = 'app-consent';

export function readConsent(): Consent | null {
  const v = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`))?.split('=')[1];
  return v === 'all' || v === 'essential' ? v : null;
}

export function saveConsent(value: Consent) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  // 13 mois : durée maximale recommandée pour un choix de consentement
  document.cookie = `${COOKIE}=${value}; Max-Age=${13 * 30 * 86400}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(EVENT));
}

/** Rouvre le bandeau (lien « Gérer les cookies » du pied de page). */
export function reopenConsent() {
  document.cookie = `${COOKIE}=; Max-Age=0; Path=/`;
  window.dispatchEvent(new Event(EVENT));
}

export function useConsent(): Consent | null | undefined {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      return () => window.removeEventListener(EVENT, cb);
    },
    readConsent,
    () => undefined, // rendu serveur : inconnu
  );
}
