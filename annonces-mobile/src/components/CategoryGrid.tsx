import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Category } from '../api/types';
import { categoryIcon, HOME_GRID } from '../lib/categoryIcons';
import { shortCategory } from '../lib/format';
import { colors, space, TITLE_FONT } from '../theme';
import { Text } from './Typography';

/** Grille d'icônes bleues de l'accueil : 7 catégories principales + « Autres » (liste complète). */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  const tiles = HOME_GRID.map((slug) => categories.find((c) => c.slug === slug)).filter((c): c is Category => !!c);
  return (
    <View style={styles.grid}>
      {tiles.map((c) => (
        <Tile key={c.id} label={shortCategory(c.name)} icon={categoryIcon(c.slug)} onPress={() => router.push(`/category/${c.id}`)} />
      ))}
      <Tile label="Autres" icon="ellipsis-horizontal" onPress={() => router.push('/categories')} />
    </View>
  );
}

export function Tile({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { backgroundColor: colors.tintLine }]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg },
  tile: {
    // 4 tuiles par ligne : (largeur − marges − 3 espaces) / 4, via flexBasis
    flexBasis: '22%',
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  // Icône et texte dans des cases de hauteur fixe : toutes les tuiles alignées, même si le texte est réduit (« Électronique »)
  iconBox: { height: 32, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, lineHeight: 18, height: 18, fontFamily: TITLE_FONT, color: colors.ink, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }, // Outfit, comme les tuiles du site
});
