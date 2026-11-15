import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Typography';
import { colors, TITLE_FONT, TITLE_FONT_REGULAR } from '../theme';

/**
 * Pastille de choix, même style que l'écran Filtres (15 novembre 2026) : fond blanc, bord bleu clair,
 * bleue avec une coche quand elle est choisie, texte en Outfit.
 */
export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && !selected && styles.pressed]}
      hitSlop={4}
    >
      {selected ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : icon ? <Ionicons name={icon} size={15} color={colors.primary} /> : null}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.tintLine,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { borderColor: colors.primary, backgroundColor: colors.tint },
  label: { fontSize: 15, fontFamily: TITLE_FONT_REGULAR, color: colors.ink },
  labelSelected: { fontFamily: TITLE_FONT, color: '#FFFFFF' },
});
