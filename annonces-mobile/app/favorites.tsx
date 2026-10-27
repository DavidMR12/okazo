import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { useFavorites, useToggleFavorite } from '../src/api/hooks';
import type { FavoriteItem } from '../src/api/types';
import { useAuth } from '../src/auth/AuthProvider';
import { DecorFooter, EmptyCard } from '../src/components/Blocks';
import { PriceTag } from '../src/components/PriceTag';
import { Text } from '../src/components/Typography';
import { colors, space, TITLE_FONT } from '../src/theme';
import { dialog } from '../src/components/Dialog';

const UNAVAILABLE: Partial<Record<FavoriteItem['status'], string>> = { sold: 'Vendue', expired: 'Expirée' };

/**
 * Favoris : grille de cartes photo avec un cœur pour retirer l'annonce (même direction artistique que le site,
 * demande du porteur du 20 octobre 2026). Compteur en haut ; encadré illustré quand la liste est vide.
 */
export default function FavoritesScreen() {
  const { status } = useAuth();
  const favorites = useFavorites();
  const toggle = useToggleFavorite();
  const items = useMemo(() => favorites.data?.pages.flatMap((p) => p.items) ?? [], [favorites.data]);

  const remove = useCallback(
    (id: string) =>
      toggle.mutate({ id, on: false }, { onError: (e) => dialog('Favoris', e instanceof ApiError ? e.message : 'Action impossible.') }),
    [toggle],
  );

  if (status !== 'signedIn') {
    return (
      <View style={[styles.screen, styles.content]}>
        <EmptyCard
          icon="heart-outline"
          decor={['heart-outline', 'pricetag-outline', 'heart', 'star-outline', 'bookmark-outline', 'heart-outline', 'sparkles-outline']}
          text="Connectez-vous, puis touchez le cœur d’une annonce pour la retrouver ici."
          action="Se connecter"
          onAction={() => router.push('/login')}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      numColumns={2}
      columnWrapperStyle={styles.columns}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        items.length ? (
          // Le titre « Mes favoris » est dans l'en-tête de l'écran : ici, seulement le compteur
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{items.length} annonce{items.length > 1 ? 's' : ''} gardée{items.length > 1 ? 's' : ''}</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => <FavCard item={item} onRemove={remove} />}
      ListEmptyComponent={
        favorites.isPending ? (
          <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />
        ) : favorites.isError ? (
          <EmptyCard icon="cloud-offline-outline" text="Impossible de charger vos favoris." action="Réessayer" onAction={() => void favorites.refetch()} />
        ) : (
          <EmptyCard icon="heart-outline" decor={['heart-outline', 'pricetag-outline', 'heart', 'star-outline', 'bookmark-outline', 'heart-outline', 'sparkles-outline']} text="Aucun favori pour l’instant. Touchez le cœur d’une annonce pour la garder ici." action="Voir les annonces" onAction={() => router.push('/')} />
        )
      }
      ListFooterComponent={items.length > 0 && items.length < 5 ? <DecorFooter icons={['heart-outline', 'pricetag-outline', 'heart', 'star-outline', 'bookmark-outline', 'heart-outline', 'sparkles-outline']} text="Touchez le cœur d’une annonce pour l’ajouter à vos favoris." /> : null}
      onEndReached={() => favorites.hasNextPage && !favorites.isFetchingNextPage && void favorites.fetchNextPage()}
      onEndReachedThreshold={0.6}
      refreshControl={<RefreshControl refreshing={favorites.isRefetching} onRefresh={() => void favorites.refetch()} tintColor={colors.primary} />}
      style={styles.screen}
    />
  );
}

function FavCard({ item, onRemove }: { item: FavoriteItem; onRemove: (id: string) => void }) {
  const off = item.available ? null : UNAVAILABLE[item.status] ?? 'Indisponible';
  return (
    <View style={[styles.card, off ? styles.cardOff : null]}>
      <Pressable onPress={() => router.push(`/listing/${item.id}`)} accessibilityRole="link" accessibilityLabel={item.title} style={({ pressed }) => pressed && { opacity: 0.85 }}>
        <View style={styles.photo}>
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <Ionicons name="image-outline" size={30} color={colors.inkMuted} />
          )}
          {off ? (
            <View style={styles.status}>
              <Text style={styles.statusText}>{off}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.body}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          {item.available ? <PriceTag priceType={item.priceType} priceXaf={item.priceXaf} size="sm" /> : null}
          <View style={styles.meta}>
            <Ionicons name="location-outline" size={14} color={colors.inkMuted} />
            <Text style={styles.metaText} numberOfLines={1}>{item.city}</Text>
          </View>
        </View>
      </Pressable>
      <Pressable onPress={() => onRemove(item.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Retirer ${item.title} des favoris`} style={styles.heart}>
        <Ionicons name="heart" size={20} color="#E0245E" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.md },
  columns: { gap: space.md },
  badge: { alignSelf: 'flex-start', height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.tint, justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  card: {
    flex: 1,
    maxWidth: '50%',
    borderRadius: 18,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: '#E6EDF8',
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardOff: { opacity: 0.6 },
  photo: { aspectRatio: 4 / 3, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  status: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.75)' },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  body: { padding: space.md, gap: 3 },
  cardTitle: { fontSize: 15, fontFamily: TITLE_FONT, color: colors.ink },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: colors.inkMuted, flexShrink: 1 },
  heart: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
