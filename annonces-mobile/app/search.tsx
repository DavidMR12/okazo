import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useMe } from '../src/api/hooks';
import type { FeedFilters } from '../src/api/types';
import { SearchResults } from '../src/components/SearchResults';
import { fromQuery } from '../src/lib/filters';
import { usePlace } from '../src/lib/place';

/**
 * Écran Recherche (barre de recherche de l'accueil, recherches sauvegardées).
 * Paramètres : q, cityId, categoryId, filters (recherche sauvegardée, en JSON), openFilters.
 */
export default function SearchScreen() {
  const p = useLocalSearchParams<{ q?: string; cityId?: string; categoryId?: string; filters?: string; openFilters?: string }>();
  const place = usePlace();
  const me = useMe();
  const initial = useMemo<FeedFilters>(() => {
    if (p.filters) {
      try {
        return fromQuery(JSON.parse(p.filters) as Record<string, string | number>);
      } catch {
        /* paramètre abîmé : recherche vide */
      }
    }
    return {
      country: place?.country ?? me.data?.countryCode,
      cityId: p.cityId ? Number(p.cityId) : place?.cityId,
      categoryId: p.categoryId ? Number(p.categoryId) : undefined,
      q: p.q,
    };
    // Valeurs de départ seulement : l'écran garde ensuite ses propres filtres
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <SearchResults initial={initial} autoFocus={!p.filters && !p.categoryId && !p.openFilters} openFilters={p.openFilters === '1'} />;
}
