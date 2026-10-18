import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCities, useCountries } from '../api/hooks';
import type { Country } from '../api/types';
import type { Place } from '../lib/place';
import { colors, space, type } from '../theme';
import { Text } from './Typography';

/** Choix du lieu de l'accueil : un pays entier, ou une ville. */
export function CityPicker({ visible, current, onClose, onPick }: { visible: boolean; current: Place | null; onClose: () => void; onPick: (p: Place) => void }) {
  const countries = useCountries();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.head, { paddingTop: space.lg }]}>
        <Text style={type.title}>Où cherchez-vous ?</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer">
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}>
        {countries.data?.map((c) => (
          <CountryCities key={c.code} country={c} current={current} onPick={onPick} />
        ))}
      </ScrollView>
    </Modal>
  );
}

function CountryCities({ country, current, onPick }: { country: Country; current: Place | null; onPick: (p: Place) => void }) {
  const cities = useCities(country.code);
  const name = country.name.replace(/\s*\(.*\)$/, '');
  return (
    <View style={styles.section}>
      <Text style={[type.small, styles.country]}>{name.toUpperCase()}</Text>
      <Row label={`Tout le ${name}`} selected={current?.country === country.code && !current.cityId} onPress={() => onPick({ country: country.code })} />
      {cities.data?.map((city) => (
        <Row
          key={city.id}
          label={city.name}
          selected={current?.cityId === city.id}
          onPress={() => onPick({ country: country.code, cityId: city.id, cityName: city.name })}
        />
      ))}
    </View>
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
  section: { paddingTop: space.md },
  country: { paddingHorizontal: space.lg, paddingBottom: space.xs, letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
