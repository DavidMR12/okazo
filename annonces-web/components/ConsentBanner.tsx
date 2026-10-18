'use client';

import Link from 'next/link';
import { reopenConsent, saveConsent, useConsent } from './consent';

/**
 * Deux choix de même poids visuel : refuser doit être aussi simple qu'accepter.
 * Visiteurs de l'Union européenne, du Royaume-Uni et de la Suisse : activer en plus le message de
 * consentement certifié de Google (AdSense > Confidentialité et messages), exigé pour y diffuser des annonces.
 */
export function ConsentBanner() {
  const consent = useConsent();
  if (consent !== null) return null; // déjà choisi, ou rendu serveur

  return (
    <div className="consent" role="dialog" aria-live="polite" aria-label="Cookies">
      <p>
        Le site est gratuit grâce à la publicité. Acceptez-vous des publicités adaptées à vos centres d’intérêt, qui utilisent des cookies ?
        Si vous refusez, vous verrez des publicités non personnalisées. <Link href="/confidentialite">En savoir plus</Link>
      </p>
      <div className="consent-actions">
        <button type="button" className="btn btn-secondary" onClick={() => saveConsent('essential')}>
          Refuser
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => saveConsent('all')}>
          Accepter
        </button>
      </div>
    </div>
  );
}

export function ManageCookiesLink() {
  return (
    <button type="button" className="link-button" onClick={reopenConsent}>
      Gérer les cookies
    </button>
  );
}
