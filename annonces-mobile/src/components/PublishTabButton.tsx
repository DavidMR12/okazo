import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, type PressableProps, StyleSheet, View } from 'react-native';
import { colors, FONT } from '../theme';
import { Text } from './Typography';

/** Bouton central « Publier » de la barre d'onglets : gros rond bleu « + », légèrement surélevé. */
export function PublishTabButton({ onPress, focused }: { onPress?: PressableProps['onPress']; focused?: boolean; children?: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={styles.wrap} accessibilityRole="button" accessibilityLabel="Publier une annonce">
      <View style={styles.circle}>
        <Ionicons name="add" size={32} color={colors.bg} />
      </View>
      <Text style={[styles.label, focused && { color: colors.primary }]}>Publier</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    borderWidth: 4,
    borderColor: colors.bg,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  label: { fontSize: 12, color: colors.inkMuted, fontFamily: FONT, marginTop: 2 },
});
