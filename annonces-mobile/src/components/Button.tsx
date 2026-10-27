import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from './Typography';
import { colors } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'whatsapp';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  icon,
  bold = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: ComponentProps<typeof Ionicons>['name'];
  bold?: boolean; // libellé en gras (« Se connecter » des écrans réservés aux comptes connectés)
}) {
  const filled = variant !== 'secondary';
  const bg = { primary: colors.primary, danger: colors.danger, whatsapp: colors.whatsapp, secondary: colors.bg }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg },
        !filled && styles.outline,
        pressed && { opacity: 0.85 },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={filled ? colors.bg : colors.primary} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={20} color={filled ? colors.bg : colors.primary} /> : null}
          {/* Une seule ligne : Roboto Slab est large, le texte rétrécit un peu plutôt que de passer à la ligne */}
          <Text
            style={[styles.label, bold && styles.bold, { color: filled ? colors.bg : colors.primary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  outline: { borderWidth: 1.5, borderColor: colors.primary },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  label: { fontSize: 16, textAlign: 'center', flexShrink: 1 },
  bold: { fontWeight: '800' },
});
