import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ReactElement, useCallback, useEffect, useMemo, useRef } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Alert, FlatList, RefreshControl, View, ViewToken } from 'react-native';
import { api } from '../api/client';
import { isLightMode, isOnline } from '../lib/network';
import { ApiError } from '../api/client';
import { useFavoriteIds, useFeed, useToggleFavorite } from '../api/hooks';
import type { FeedFilters, ListingCard, ListingDetail } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { setPendingAction, takePendingAction } from '../lib/pendingAction';
import { colors, space } from '../theme';
import { ListingRow, ROW_HEIGHT } from './ListingRow';
import { Message } from './Message';

/** Liste d’annonces paginée (accueil, profil vendeur), avec les annonces « à la une » en tête. */
export function ListingFeed({
  filters,
  header,
  onClearFilters,
  empty: emptyMessage,
}: {
  filters: FeedFilters;
  header?: ReactElement;
  onClearFilters?: () => void;
  empty?: { title: string; body?: string; actionLabel?: string; onAction?: () => void }; // remplace le message par défaut
}) {
  const feed = useFeed(filters);
  const favoriteIds = useFavoriteIds();
  const toggle = useToggleFavorite();
  const { status } = useAuth();

  const items = useMemo(() => {
    const pages = feed.data?.pages ?? [];
    const featured = pages[0]?.featured ?? [];
    const seen = new Set(featured.map((f) => f.id));
    // Une annonce boostée peut aussi apparaître dans le flux normal : on l’affiche une seule fois
    const rest = pages.flatMap((p) => p.items).filter((i) => !seen.has(i.id) && (seen.add(i.id), true));
    return [...featured, ...rest];
  }, [feed.data]);

  const onToggleFavorite = useCallback(
    (id: string, on: boolean) => {
      if (status !== 'signedIn') {
        setPendingAction('favorite', id, 'feed');
        router.push('/login');
        return;
      }
      toggle.mutate(
        { id, on },
        { onError: (e) => Alert.alert('Favoris', e instanceof ApiError ? e.message : 'Action impossible.') },
      );
    },
    [status, toggle],
  );

  // Favori demandé avant la connexion : ajouté automatiquement au retour
  useEffect(() => {
    if (status !== 'signedIn') return;
    const a = takePendingAction('feed');
    if (a?.kind === 'favorite') toggle.mutate({ id: a.listingId, on: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Préchargement : la page d'annonce et sa première photo arrivent avant le toucher (désactivé en mode léger)
  const qc = useQueryClient();
  const prefetched = useRef(new Set<string>());
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (isLightMode() || !isOnline()) return;
    for (const v of viewableItems) {
      const id = (v.item as ListingCard | undefined)?.id;
      if (!id || prefetched.current.has(id)) continue;
      prefetched.current.add(id);
      void qc
        .prefetchQuery({ queryKey: ['listing', id], queryFn: () => api<ListingDetail>(`/listings/${id}`), staleTime: 60_000 })
        .then(() => {
          const first = qc.getQueryData<ListingDetail>(['listing', id])?.images[0]?.url;
          if (first) void Image.prefetch(first, 'memory-disk').catch(() => undefined);
        });
    }
  }).current;

  const renderItem = useCallback(
    ({ item }: { item: ListingCard }) => (
      <ListingRow item={item} favorited={favoriteIds.has(item.id)} onToggleFavorite={onToggleFavorite} />
    ),
    [favoriteIds, onToggleFavorite],
  );

  let empty: ReactElement | null = null;
  if (feed.isPending) {
    empty = <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  } else if (feed.isError && !items.length) {
    empty = (
      <Message
        title="Impossible de charger les annonces"
        body={feed.error instanceof ApiError ? feed.error.message : undefined}
        actionLabel="Réessayer"
        onAction={() => void feed.refetch()}
      />
    );
  } else if (!items.length && emptyMessage) {
    empty = <Message {...emptyMessage} />;
  } else if (!items.length) {
    empty = (
      <Message
        title="Aucune annonce pour ces critères"
        body="Essayez un autre mot ou une autre catégorie."
        actionLabel={onClearFilters ? 'Effacer les filtres' : undefined}
        onAction={onClearFilters}
      />
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      renderItem={renderItem}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60, minimumViewTime: 300 }}
      getItemLayout={(_d, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator style={{ margin: space.lg }} color={colors.primary} /> : <View style={{ height: space.xl }} />}
      onEndReached={() => {
        if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
      }}
      onEndReachedThreshold={0.6}
      refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => void feed.refetch()} tintColor={colors.primary} />}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      style={{ backgroundColor: colors.bg }}
    />
  );
}
