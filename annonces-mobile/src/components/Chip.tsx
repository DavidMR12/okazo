import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Typography';
import { colors } from '../theme';

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
      hitSlop={4}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  labelSelected: { color: colors.bg },
});
