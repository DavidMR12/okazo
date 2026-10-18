'use client';

import { useEffect } from 'react';
import { ADSENSE_CLIENT } from '@/lib/site';
import { useConsent } from './consent';

declare global {
  interface Window {
    adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number };
  }
}

/**
 * Charge le script AdSense seulement APRÈS le choix du visiteur.
 * Refus : publicités non personnalisées (requestNonPersonalizedAds = 1).
 */
export function AdsLoader() {
  const consent = useConsent();

  useEffect(() => {
    if (!ADSENSE_CLIENT || !consent) return;
    const queue = (window.adsbygoogle = window.adsbygoogle || ([] as unknown[] & { requestNonPersonalizedAds?: number }));
    queue.requestNonPersonalizedAds = consent === 'all' ? 0 : 1;
    if (document.getElementById('adsbygoogle-js')) return;
    const s = document.createElement('script');
    s.id = 'adsbygoogle-js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    document.head.appendChild(s);
  }, [consent]);

  return null;
}
