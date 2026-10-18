'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';

/** « Sauvegarder cette recherche » : retrouvée dans Mon compte, avec le nombre de nouvelles annonces. */
export function SaveSearchButton({ query, name }: { query: Record<string, string | number | undefined>; name: string }) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<'idle' | 'busy' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!signedIn) {
      router.push(`/connexion?retour=${encodeURIComponent(pathname + window.location.search)}`);
      return;
    }
    setState('busy');
    setError(null);
    try {
      const clean = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
      await call('/me/searches', { method: 'POST', body: { name, query: clean } });
      setState('saved');
    } catch (e) {
      setState('idle');
      setError(e instanceof ClientError ? e.message : 'Sauvegarde impossible.');
    }
  };

  return (
    <span className="save-search">
      {state === 'saved' ? (
        <span className="saved">✓ Recherche sauvegardée (Mon compte, puis Mes recherches)</span>
      ) : (
        <button type="button" className="link-button save-search-btn" onClick={() => void save()} disabled={state === 'busy'}>
          Sauvegarder cette recherche
        </button>
      )}
      {error ? <span className="error"> {error}</span> : null}
    </span>
  );
}
