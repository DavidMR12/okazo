import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ListingCard } from '../api/types';
import { placeLabel, priceLabel, relativeTime } from '../lib/format';
import { colors, PRICE_FONT, space, TITLE_FONT } from '../theme';
import { cardShadow } from './Blocks';
import { Text } from './Typography';

export const TILE_WIDTH = 168;
const BODY_HEIGHT = 106;

/** Hauteur d'une carte (photo carrée + texte) : fixe, pour un défilement fluide (getItemLayout). */
export const tileHeight = (width: number) => width + BODY_HEIGHT + 2;

interface Props {
  item: ListingCard;
  favorited: boolean;
  onToggleFavorite: (id: string, on: boolean) => void;
  width?: number;
}

/**
 * Carte « Vitrine » (choix du porteur, 1er novembre 2026) : carte blanche en relief, prix dans un ovale bleu à
 * cheval sur la photo. Dans l'ovale, le montant seul ; l'unité et « À débattre » dessous, pour ne jamais le couper.
 */
function ListingTileBase({ item, favorited, onToggleFavorite, width = TILE_WIDTH }: Props) {
  const amount = item.priceType === 'fixed' || item.priceType === 'negotiable';
  const note = [amount && item.priceXaf !== null && item.priceUnit ? `/ ${item.priceUnit}` : null, item.priceType === 'negotiable' ? 'À débattre' : null].filter(Boolean).join(' · ');
  const badge = [item.boosted ? 'À la une' : null, item.adType === 'request' ? 'Je recherche' : null].filter(Boolean).join(' · ');
  const inner = width - 2;
  return (
    // Le cœur est à côté de la carte cliquable, pas dedans : un bouton ne peut pas contenir un autre bouton
    <View style={[styles.card, { width }]}>
      <Pressable onPress={() => router.push(`/listing/${item.id}`)} accessibilityRole="button" accessibilityLabel={item.title}>
        <View style={styles.media}>
          {item.thumbnailUrl ? (
            <Image source={item.thumbnailUrl} style={[styles.photo, { width: inner, height: inner }]} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.id} transition={120} />
          ) : (
            <View style={[styles.photo, styles.photoEmpty, { width: inner, height: inner }]}>
              <Ionicons name="image-outline" size={30} color={colors.primary} />
            </View>
          )}
          {badge ? (
            <View style={styles.badge}>
              {item.boosted ? <Ionicons name="flame" size={12} color={colors.navy} /> : null}
              <Text style={styles.badgeText} numberOfLines={1}>{badge}</Text>
            </View>
          ) : null}
          <View style={styles.price}>
            <Text style={styles.priceText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{priceLabel(item.priceType, item.priceXaf)}</Text>
          </View>
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.note} numberOfLines={1}>{note}</Text>
          <View style={styles.meta}>
            <Ionicons name="location-outline" size={13} color={colors.inkMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {placeLabel(item.city, item.district)}
              {item.publishedAt ? ` · ${relativeTime(item.publishedAt)}` : ''}
            </Text>
          </View>
        </View>
      </Pressable>
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
  );
}

export const ListingTile = memo(ListingTileBase);

const styles = StyleSheet.create({
  card: { borderRadius: 18, backgroundColor: colors.bg, ...cardShadow },
  media: { zIndex: 1 },
  photo: { borderTopLeftRadius: 17, borderTopRightRadius: 17, backgroundColor: colors.surface },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint },
  badge: { position: 'absolute', top: 8, left: 8, maxWidth: '68%', flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.saffron },
  badgeText: { fontSize: 11, lineHeight: 15, fontWeight: '800', color: colors.navy, flexShrink: 1 },
  price: { position: 'absolute', left: 8, bottom: -13, maxWidth: '88%', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.primary },
  priceText: { fontSize: 14, lineHeight: 18, fontFamily: PRICE_FONT, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  heart: { position: 'absolute', zIndex: 2, top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  body: { height: BODY_HEIGHT, paddingTop: 20, paddingHorizontal: space.sm + 3, gap: 4, overflow: 'hidden' },
  title: { fontSize: 14, lineHeight: 18, fontFamily: TITLE_FONT, color: colors.ink, height: 36 },
  note: { fontSize: 12, lineHeight: 16, height: 16, fontWeight: '700', color: colors.primary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 16 },
  metaText: { fontSize: 12, color: colors.inkMuted, flexShrink: 1 },
});
