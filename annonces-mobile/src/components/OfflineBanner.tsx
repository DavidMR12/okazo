import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetwork } from '../lib/network';
import { colors, space } from '../theme';
import { Text } from './Typography';

/** Bandeau discret « Hors connexion », au-dessus de la barre d'onglets : l'app reste utilisable avec ses données enregistrées. */
export function OfflineBanner() {
  const { online } = useNetwork();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 72 }]} pointerEvents="none" accessibilityLiveRegion="polite">
      <View style={styles.pill}>
        <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
        <Text style={styles.text}>Hors connexion : vous voyez les dernières données enregistrées.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: space.md, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.ink, borderRadius: 18, paddingHorizontal: space.md, paddingVertical: space.sm, maxWidth: 420 },
  text: { color: '#fff', fontSize: 13, flexShrink: 1 },
});
