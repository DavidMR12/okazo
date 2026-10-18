'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { pageParams } from '@/lib/searchParams';
import type { Category, City } from '@/lib/types';

interface Saved { id: string; name: string; query: Record<string, string | number>; newCount: number }

/** Mes recherches : relancer une recherche en un clic, avec le nombre de nouvelles annonces. */
export default function SavedSearchesPage() {
  const signedIn = useSignedIn();
  const [items, setItems] = useState<Saved[] | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ items: list }, { categories }] = await Promise.all([
        call<{ items: Saved[] }>('/me/searches'),
        call<{ categories: Category[] }>('/categories'),
      ]);
      // Adresse de chaque recherche : /pays/catégorie/ville?filtres (identifiants → liens lisibles)
      const all = categories.flatMap((c) => [c, ...(c.children ?? [])]);
      const citiesByCountry: Record<string, City[]> = {};
      for (const code of new Set(list.map((s) => String(s.query.country ?? 'CM')))) {
        citiesByCountry[code] = (await call<{ cities: City[] }>(`/geo/cities?country=${code}`)).cities;
      }
      const hrefs: Record<string, string> = {};
      for (const s of list) {
        const country = String(s.query.country ?? 'CM');
        const cat = all.find((c) => c.id === Number(s.query.categoryId));
        const city = citiesByCountry[country]?.find((c) => c.id === Number(s.query.cityId));
        const path = `/${country.toLowerCase()}${cat || city ? `/${cat?.slug ?? 'toutes'}` : ''}${city ? `/${city.slug}` : ''}`;
        const params = pageParams(s.query);
        hrefs[s.id] = params.size ? `${path}?${params}` : path;
      }
      setLinks(hrefs);
      setItems(list);
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Impossible de charger vos recherches.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement voulu à l’affichage
    if (signedIn) void load();
  }, [signedIn, load]);

  const remove = async (id: string) => {
    setItems((xs) => xs?.filter((x) => x.id !== id) ?? null);
    await call(`/me/searches/${id}`, { method: 'DELETE' }).catch(() => void load());
  };

  if (signedIn === false) {
    return (
      <div className="narrow stack">
        <h1>Mes recherches</h1>
        <p>Connectez-vous pour retrouver vos recherches sauvegardées.</p>
        <Link href="/connexion?retour=/recherches" className="btn">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="container section stack" style={{ maxWidth: 760 }}>
      <h1>Mes recherches</h1>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {!items && !error ? <p className="muted">Chargement…</p> : null}
      {items && !items.length ? <p>Aucune recherche sauvegardée. Lancez une recherche, réglez les filtres, puis cliquez sur « Sauvegarder cette recherche ».</p> : null}
      <ul className="my-list">
        {items?.map((s) => (
          <li key={s.id} className="my-item">
            <span className="stack" style={{ gap: 2 }}>
              {/* Ouvrir la recherche remet ses nouveautés à zéro */}
              <Link href={links[s.id] ?? '/'} onClick={() => void call(`/me/searches/${s.id}/seen`, { method: 'POST' }).catch(() => undefined)}>
                {s.name}
              </Link>
              <span className={s.newCount ? 'status status-wait' : 'muted'}>
                {s.newCount ? `${s.newCount} nouvelle${s.newCount > 1 ? 's' : ''} annonce${s.newCount > 1 ? 's' : ''}` : 'Pas de nouvelle annonce'}
              </span>
            </span>
            <span className="my-actions">
              <button type="button" className="link-button" onClick={() => void remove(s.id)}>Supprimer</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
