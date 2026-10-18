import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl } from 'react-native';
import { ApiError } from '../src/api/client';
import { useFavorites, useToggleFavorite } from '../src/api/hooks';
import type { FavoriteItem } from '../src/api/types';
import { useAuth } from '../src/auth/AuthProvider';
import { ListingRow, ROW_HEIGHT } from '../src/components/ListingRow';
import { Message } from '../src/components/Message';
import { colors, space } from '../src/theme';

const UNAVAILABLE: Partial<Record<FavoriteItem['status'], string>> = { sold: 'Vendue', expired: 'Expirée' };

export default function FavoritesScreen() {
  const { status } = useAuth();
  const favorites = useFavorites();
  const toggle = useToggleFavorite();
  const items = useMemo(() => favorites.data?.pages.flatMap((p) => p.items) ?? [], [favorites.data]);

  const onToggle = useCallback(
    (id: string, on: boolean) =>
      toggle.mutate({ id, on }, { onError: (e) => Alert.alert('Favoris', e instanceof ApiError ? e.message : 'Action impossible.') }),
    [toggle],
  );

  if (status !== 'signedIn') {
    return (
      <Message
        title="Retrouvez ici les annonces qui vous intéressent"
        body="Connectez-vous, puis touchez le cœur d’une annonce pour la garder."
        actionLabel="Se connecter"
        onAction={() => router.push('/login')}
      />
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => (
        <ListingRow
          item={item}
          favorited
          onToggleFavorite={onToggle}
          unavailableLabel={item.available ? undefined : UNAVAILABLE[item.status] ?? 'Indisponible'}
        />
      )}
      getItemLayout={(_d, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
      ListEmptyComponent={
        favorites.isPending ? (
          <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />
        ) : favorites.isError ? (
          <Message title="Impossible de charger vos favoris" actionLabel="Réessayer" onAction={() => void favorites.refetch()} />
        ) : (
          <Message title="Aucun favori pour l’instant" body="Touchez le cœur d’une annonce pour l’ajouter ici." />
        )
      }
      onEndReached={() => favorites.hasNextPage && !favorites.isFetchingNextPage && void favorites.fetchNextPage()}
      onEndReachedThreshold={0.6}
      refreshControl={<RefreshControl refreshing={favorites.isRefetching} onRefresh={() => void favorites.refetch()} tintColor={colors.primary} />}
      style={{ backgroundColor: colors.bg }}
    />
  );
}
