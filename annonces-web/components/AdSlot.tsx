'use client';

import { useEffect, useRef } from 'react';
import { ADSENSE_CLIENT } from '@/lib/site';
import { useConsent } from './consent';
import { imageOutline } from 'ionicons/icons';
import { Ion } from './Ion';

/**
 * Emplacement publicitaire. Sa hauteur est réservée d'avance : la page ne « saute » pas quand
 * l'annonce arrive (bon pour les visiteurs et pour le classement Google).
 */
export function AdSlot({ slot, minHeight = 250 }: { slot: string; minHeight?: number }) {
  const consent = useConsent();
  const pushed = useRef(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT || !slot || !consent || pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      /* bloqueur de publicité : on laisse l'emplacement vide */
    }
  }, [consent, slot]);

  // Pas encore de compte AdSense : en développement, un emplacement de test montre la place réservée (rien en production)
  if (!ADSENSE_CLIENT || !slot) {
    if (process.env.NODE_ENV === 'production') return null;
    return (
      <aside className="ad ad-test" style={{ minHeight }} aria-label="Publicité (emplacement de test)">
        <span className="ad-label">Publicité</span>
        <span className="ad-test-area">
          <Ion icon={imageOutline} size={44} />
          <span className="ad-test-text">Emplacement Google AdSense (test)</span>
        </span>
      </aside>
    );
  }
  return (
    <aside className="ad" style={{ minHeight }} aria-label="Publicité">
      <span className="ad-label">Publicité</span>
      {consent ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : null}
    </aside>
  );
}
