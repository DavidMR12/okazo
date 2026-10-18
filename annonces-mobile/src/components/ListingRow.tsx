import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import type { PriceType } from '../api/types';
import { placeLabel, relativeTime } from '../lib/format';
import { colors, space, TITLE_FONT } from '../theme';
import { PriceTag } from './PriceTag';

// Hauteur fixe (carte + espace dessous) : défilement fluide sur petits téléphones (getItemLayout)
const CARD_HEIGHT = 112;
const CARD_GAP = 12;
export const ROW_HEIGHT = CARD_HEIGHT + CARD_GAP;

export interface RowData {
  id: string;
  title: string;
  priceType: PriceType;
  priceXaf: number | null;
  city: string;
  district?: string | null;
  publishedAt?: string | null;
  thumbnailUrl: string | null;
  boosted?: boolean;
  adType?: 'offer' | 'request';
  priceUnit?: string | null;
}

interface Props {
  item: RowData;
  favorited?: boolean;
  onToggleFavorite?: (id: string, on: boolean) => void;
  unavailableLabel?: string; // ex. « Vendue » dans les favoris
}

function ListingRowBase({ item, favorited, onToggleFavorite, unavailableLabel }: Props) {
  return (
    <Pressable
      onPress={() => router.push(`/listing/${item.id}`)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.tint }]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      {item.thumbnailUrl ? (
        <Image
          source={item.thumbnailUrl}
          style={[styles.thumb, unavailableLabel ? { opacity: 0.45 } : null]}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={item.id}
          transition={120}
        />
      ) : (
        // Photo pas encore traitée : emplacement neutre plutôt qu’un carré vide
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Ionicons name="image-outline" size={28} color={colors.inkMuted} />
        </View>
      )}
      <View style={styles.body}>
        {item.boosted || item.adType === 'request' ? (
          <View style={styles.badge}>
            {item.boosted ? <Ionicons name="flame" size={13} color={colors.primary} /> : null}
            <Text style={styles.badgeText} numberOfLines={1}>
              {[item.boosted ? 'À la une' : null, item.adType === 'request' ? 'Je recherche' : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.title, unavailableLabel ? { color: colors.inkMuted } : null]} numberOfLines={item.boosted || item.adType === 'request' ? 1 : 2}>
          {item.title}
        </Text>
        <View style={styles.spacer} />
        {unavailableLabel ? (
          <Text style={styles.unavailable}>{unavailableLabel}</Text>
        ) : (
          <PriceTag priceType={item.priceType} priceXaf={item.priceXaf} unit={item.priceUnit} />
        )}
        {/* Lieu | date, chacun avec son icône (maquette du porteur, 18 octobre 2026) */}
        <View style={styles.meta}>
          <Ionicons name="location-outline" size={15} color={colors.inkMuted} />
          <Text style={[styles.metaText, styles.place]} numberOfLines={1}>{placeLabel(item.city, item.district)}</Text>
          {item.publishedAt ? (
            <>
              <View style={styles.sep} />
              <Ionicons name="calendar-outline" size={14} color={colors.inkMuted} />
              <Text style={styles.metaText} numberOfLines={1}>{relativeTime(item.publishedAt)}</Text>
            </>
          ) : null}
        </View>
      </View>
      {onToggleFavorite ? (
        <Pressable
          onPress={() => onToggleFavorite(item.id, !favorited)}
          hitSlop={12}
          style={styles.heart}
          accessibilityRole="button"
          accessibilityLabel={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={22} color={favorited ? colors.danger : colors.inkMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export const ListingRow = memo(ListingRowBase);

const styles = StyleSheet.create({
  // Carte aux coins arrondis, fine bordure bleu pâle, une carte par annonce (maquette du porteur)
  row: {
    height: CARD_HEIGHT,
    marginBottom: CARD_GAP,
    marginHorizontal: space.lg,
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E3EAF7',
    backgroundColor: colors.bg,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  thumb: { width: 96, height: 86, borderRadius: 10, backgroundColor: colors.surface },
  thumbEmpty: { backgroundColor: '#E3E7EF', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, alignSelf: 'stretch', paddingRight: 24 },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.tint, marginBottom: 4 },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.primary },
  title: { fontSize: 15, lineHeight: 19, fontFamily: TITLE_FONT, color: colors.ink },
  spacer: { flex: 1 },
  unavailable: { fontSize: 14, fontWeight: '700', color: colors.inkMuted },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  metaText: { fontSize: 12, color: colors.inkMuted, fontWeight: '400' },
  place: { flexShrink: 1 },
  sep: { width: 1, height: 13, backgroundColor: colors.line, marginHorizontal: 6 },
  heart: { position: 'absolute', top: 12, right: 12 },
});
