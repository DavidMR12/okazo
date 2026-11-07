'use client';

import { cloudOfflineOutline } from 'ionicons/icons';
import { useSyncExternalStore } from 'react';
import { Ion } from './Ion';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Bandeau discret « Hors connexion », comme dans l'application : le site reste utilisable avec ce qui est enregistré. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <Ion icon={cloudOfflineOutline} size={16} />
      Hors connexion : vous voyez les derniers articles enregistrés.
    </div>
  );
}
