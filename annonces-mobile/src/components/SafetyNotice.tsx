import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { safetyTips } from '../lib/safety';
import { colors, space } from '../theme';

/** Affiché avant chaque prise de contact : c’est au moment du contact que l’arnaque se produit. */
export function SafetyNotice({ parentSlug }: { parentSlug?: string | null }) {
  const tips = safetyTips(parentSlug);
  return (
    <View style={styles.box}>
      <View style={styles.titleRow}>
        <View style={styles.icon}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.navy} />
        </View>
        <Text style={styles.title}>{tips.title}</Text>
      </View>
      {tips.lines.map((l) => (
        <Text key={l} style={styles.line}>
          {l}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Encadré bleu pâle, comme les autres conseils de l'application (décision du porteur, 27 octobre 2026)
  box: { backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintLine, borderRadius: 16, padding: space.lg, gap: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: 2 },
  icon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: colors.navy },
  line: { fontSize: 14, lineHeight: 20, color: colors.inkMuted },
});
