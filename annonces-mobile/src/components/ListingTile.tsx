import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ListingCard } from '../api/types';
import { placeLabel, relativeTime } from '../lib/format';
import { colors, space, TITLE_FONT } from '../theme';
import { PriceTag } from './PriceTag';
import { Text } from './Typography';

export const TILE_WIDTH = 168;

/** Carte verticale (« Annonces près de vous ») : grande photo, cœur en surimpression, titre, prix, lieu. */
function ListingTileBase({ item, favorited, onToggleFavorite }: { item: ListingCard; favorited: boolean; onToggleFavorite: (id: string, on: boolean) => void }) {
  return (
    <Pressable onPress={() => router.push(`/listing/${item.id}`)} style={styles.card} accessibilityRole="button" accessibilityLabel={item.title}>
      <View>
        {item.thumbnailUrl ? (
          <Image source={item.thumbnailUrl} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.id} transition={120} />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Ionicons name="image-outline" size={30} color={colors.inkMuted} />
          </View>
        )}
        <Pressable
          onPress={() => onToggleFavorite(item.id, !favorited)}
          hitSlop={8}
          style={styles.heart}
          accessibilityRole="button"
          accessibilityLabel={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={18} color={favorited ? colors.danger : colors.ink} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <PriceTag priceType={item.priceType} priceXaf={item.priceXaf} unit={item.priceUnit} size="sm" />
        <View style={styles.meta}>
          <Ionicons name="location-outline" size={13} color={colors.inkMuted} />
          <Text style={styles.metaText} numberOfLines={1}>
            {placeLabel(item.city, item.district)}
            {item.publishedAt ? ` · ${relativeTime(item.publishedAt)}` : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export const ListingTile = memo(ListingTileBase);

const styles = StyleSheet.create({
  card: { width: TILE_WIDTH, borderRadius: 14, backgroundColor: colors.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, overflow: 'hidden' },
  photo: { width: TILE_WIDTH, height: 120, backgroundColor: colors.surface },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint },
  heart: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.sm, gap: 4, minHeight: 112 }, // hauteur constante, avec ou sans « à débattre »
  title: { fontSize: 14, lineHeight: 18, fontFamily: TITLE_FONT, color: colors.ink, minHeight: 36 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: colors.inkMuted, flexShrink: 1 },
});
