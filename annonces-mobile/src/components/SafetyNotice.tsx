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
        <Ionicons name="warning-outline" size={18} color={colors.ink} />
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
  box: { backgroundColor: colors.warningBg, borderRadius: 10, padding: space.lg, gap: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  line: { fontSize: 14, lineHeight: 20, color: colors.ink },
});
