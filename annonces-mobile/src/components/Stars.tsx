import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, space } from '../theme';
import { Text } from './Typography';

const STAR = '#F5B700'; // étoiles dorées : repère universel, lisible sur fond blanc
export const RATING_LABELS = ['', 'Très décevant', 'Décevant', 'Correct', 'Bien', 'Excellent'];

/** Note affichée (demi-étoiles comprises). */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${String(value).replace('.', ',')} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={value >= i ? 'star' : value >= i - 0.5 ? 'star-half' : 'star-outline'} size={size} color={STAR} />
      ))}
    </View>
  );
}

/** « ★ 4,6 · 12 avis » (ou « Pas encore d’avis »). */
export function RatingSummary({ avg, count }: { avg?: number | null; count?: number }) {
  if (!count || avg === null || avg === undefined) return <Text style={styles.muted}>Pas encore d’avis</Text>;
  return (
    <View style={[styles.row, { gap: space.xs }]}>
      <Ionicons name="star" size={15} color={STAR} />
      <Text style={styles.avg}>{avg.toFixed(1).replace('.', ',')}</Text>
      <Text style={styles.muted}>· {count} avis</Text>
    </View>
  );
}

/** Choix de la note : 5 grandes étoiles à toucher. */
export function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={[styles.row, { gap: space.sm }]} accessibilityRole="radiogroup" accessibilityLabel="Note">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          onPress={() => onChange(i)}
          hitSlop={6}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === i }}
          accessibilityLabel={`${i} étoile${i > 1 ? 's' : ''}, ${RATING_LABELS[i]}`}
        >
          <Ionicons name={value >= i ? 'star' : 'star-outline'} size={40} color={STAR} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  avg: { fontSize: 15, color: colors.ink },
  muted: { fontSize: 14, color: colors.inkMuted },
});
