import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator } from 'react-native';
import { useCategories, useMe } from '../../src/api/hooks';
import { SearchResults } from '../../src/components/SearchResults';
import { usePlace } from '../../src/lib/place';
import { colors, space } from '../../src/theme';

/**
 * Annonces d'une catégorie (tuiles de l'accueil) : même écran que la recherche, catégorie présélectionnée
 * (sous-catégories et champs dans les filtres). id = « all » : toutes catégories (« Voir tout » près de vous).
 */
export default function CategoryScreen() {
  const params = useLocalSearchParams<{ id: string; cityId?: string; country?: string }>();
  const categories = useCategories();
  const me = useMe();
  const place = usePlace();
  const parent = params.id === 'all' ? undefined : categories.data?.find((c) => c.id === Number(params.id));
  const cityId = params.cityId ? Number(params.cityId) : place?.cityId;
  const title = parent?.name ?? (cityId && place?.cityName ? `Annonces à ${place.cityName}` : 'Annonces');

  const initial = useMemo(
    () => ({ country: params.country ?? place?.country ?? me.data?.countryCode, cityId, categoryId: parent?.id }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parent?.id],
  );

  if (params.id !== 'all' && !parent) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  return (
    <>
      <Stack.Screen options={{ title }} />
      <SearchResults key={parent?.id ?? 'all'} initial={initial} />
    </>
  );
}
