'use client';

import { useEffect } from 'react';

/** Mode hors ligne : pages et photos déjà consultées restent disponibles sans réseau. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const media = process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? '';
    navigator.serviceWorker.register(`/sw.js?media=${encodeURIComponent(media)}`).catch(() => undefined);
  }, []);
  return null;
}
