import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCities } from '../api/hooks';
import type { Place } from '../lib/place';
import { colors, space, type } from '../theme';
import { Text } from './Typography';

/**
 * Choix de la ville de l'accueil, comme Uber : seulement les villes du pays de l'utilisateur, et « Tout le pays ».
 * Les autres pays ne sont jamais proposés.
 */
export function CityPicker({ visible, current, onClose, onPick, onChangeCountry }: { visible: boolean; current: Place | null; onClose: () => void; onPick: (p: Place) => void; onChangeCountry?: () => void }) {
  const insets = useSafeAreaInsets();
  const country = current?.country;
  const cities = useCities(country);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.head, { paddingTop: space.lg }]}>
        <Text style={type.title}>Où cherchez-vous ?</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer">
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}>
        {country ? (
          <>
            {cities.data
              ?.filter((c) => c.slug !== 'autre')
              .map((city) => (
                <Row
                  key={city.id}
                  label={city.name}
                  selected={current?.cityId === city.id}
                  onPress={() => onPick({ country, cityId: city.id, cityName: city.name })}
                />
              ))}
            <Row label="Tout le pays" selected={!current?.cityId} onPress={() => onPick({ country })} />
            {/* Seulement pour qui a choisi son pays depuis l'étranger (CountryChooser) */}
            {onChangeCountry ? (
              <Pressable onPress={onChangeCountry} style={styles.row} accessibilityRole="button">
                <Ionicons name="globe-outline" size={18} color={colors.primary} />
                <Text style={[type.body, { flex: 1, color: colors.primary, fontWeight: '700' }]}>Changer de pays</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Modal>
  );
}

function Row({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityState={{ selected }}>
      <Ionicons name="location-outline" size={18} color={colors.primary} />
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
