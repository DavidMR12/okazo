import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { colors } from '../theme';

export function VerifiedBadge() {
  return (
    <View style={styles.badge} accessibilityLabel="Identité vérifiée">
      <Ionicons name="shield-checkmark-outline" size={14} color={colors.trust} />
      <Text style={styles.text}>Identité vérifiée</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { fontSize: 13, fontWeight: '600', color: colors.trust },
});
