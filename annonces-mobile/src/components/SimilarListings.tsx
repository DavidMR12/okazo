import { useQuery } from '@tanstack/react-query';
import { FlatList, StyleSheet, View } from 'react-native';
import { api, qs } from '../api/client';
import type { ListingsPage } from '../api/types';
import { colors, space } from '../theme';
import { ListingTile } from './ListingTile';
import { Text } from './Typography';

/** Page d'annonce : « Annonces similaires », même catégorie et même pays, en rangée qui défile horizontalement. */
export function SimilarListings({
  listingId,
  categoryId,
  country,
  favoriteIds,
  onToggleFavorite,
}: {
  listingId: string;
  categoryId: number;
  country: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string, on: boolean) => void;
}) {
  const q = useQuery({
    queryKey: ['similar', categoryId, country],
    queryFn: () => api<ListingsPage>(`/listings${qs({ country, categoryId, limit: 13 })}`),
    staleTime: 5 * 60 * 1000,
  });
  const items = (q.data?.items ?? []).filter((x) => x.id !== listingId).slice(0, 12);
  if (!items.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Annonces similaires</Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ListingTile item={item} favorited={favoriteIds.has(item.id)} onToggleFavorite={onToggleFavorite} />}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingTop: space.xl },
  title: { fontSize: 17, color: colors.ink, paddingHorizontal: space.lg },
});
