import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useCities, useCountries } from '../api/hooks';
import type { Country } from '../api/types';
import type { Place } from '../lib/place';
import { colors, space, TITLE_FONT, TITLE_FONT_REGULAR } from '../theme';
import { Chip } from './Chip';
import { Flag } from './Flag';
import { Text } from './Typography';

/**
 * Utilisateur hors des pays ouverts (18 novembre 2026, comme Louam) : au lieu de lui imposer le Cameroun, on lui
 * demande où il cherche (la diaspora cherche souvent au pays depuis l'étranger). Pays, puis ville ou tout le pays.
 * Sans onClose, la fenêtre ne se ferme pas avant le choix (premier lancement).
 */
export function CountryChooser({ visible, current, onPick, onClose }: { visible: boolean; current?: string; onPick: (p: Place) => void; onClose?: () => void }) {
  const countries = useCountries();
  const list = countries.data ?? [];
  const [picked, setPicked] = useState<Country | null>(null);
  const country = picked ?? (list.length === 1 ? list[0] : null);
  const cities = useCities(country?.code);
  const name = (c: Country) => c.name.replace(/\s*\(.*\)$/, '');
  const done = (p: Place) => {
    setPicked(null);
    onPick({ ...p, abroad: true });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose ?? (() => undefined)} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            {country ? (
              <>
                <View style={styles.titleRow}>
                  <Flag code={country.code} width={30} />
                  <Text style={styles.title}>{name(country)}</Text>
                </View>
                <Text style={styles.text}>Dans quelle ville cherchez-vous ?</Text>
                <View style={styles.cities}>
                  {cities.data
                    ?.filter((c) => c.slug !== 'autre')
                    .map((c) => (
                      <Chip key={c.id} label={c.name} selected={false} onPress={() => done({ country: country.code, cityId: c.id, cityName: c.name })} />
                    ))}
                  <Chip label="Tout le pays" selected={false} onPress={() => done({ country: country.code })} />
                </View>
                {list.length > 1 ? <Link label="Changer de pays" onPress={() => setPicked(null)} /> : null}
              </>
            ) : (
              <>
                <Text style={styles.title}>Où cherchez-vous ?</Text>
                <Text style={styles.text}>Okazo est ouvert dans ces pays. Choisissez celui qui vous intéresse, vous pourrez en changer ensuite.</Text>
                <View style={{ gap: space.sm }}>
                  {list.map((c) => {
                    const on = c.code === current;
                    return (
                      <Pressable
                        key={c.code}
                        onPress={() => setPicked(c)}
                        style={({ pressed }) => [styles.country, (on || pressed) && styles.countryOn]}
                        accessibilityRole="button"
                        accessibilityLabel={name(c)}
                      >
                        <Flag code={c.code} width={34} />
                        <Text style={styles.countryName}>{name(c)}</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                      </Pressable>
                    );
                  })}
                </View>
                {onClose ? <Link label="Fermer" onPress={onClose} /> : null}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.link, pressed && { backgroundColor: colors.tint }]} accessibilityRole="button" hitSlop={6}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(16, 24, 64, 0.55)', justifyContent: 'center', padding: space.lg },
  box: { maxHeight: '90%', backgroundColor: colors.bg, borderRadius: 20, overflow: 'hidden' },
  content: { padding: space.xl, paddingBottom: space.lg, gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { fontSize: 21, fontFamily: TITLE_FONT, color: colors.ink, textAlign: 'center' },
  text: { fontSize: 15, lineHeight: 22, fontFamily: TITLE_FONT_REGULAR, color: colors.inkMuted, textAlign: 'center' },
  cities: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
  country: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 58, paddingHorizontal: space.lg, borderRadius: 16, borderWidth: 1.5, borderColor: colors.tintLine, backgroundColor: colors.bg },
  countryOn: { borderColor: colors.primary, backgroundColor: colors.tint },
  countryName: { flex: 1, fontSize: 17, fontFamily: TITLE_FONT, color: colors.ink },
  link: { alignSelf: 'center', minHeight: 44, paddingHorizontal: space.lg, borderRadius: 22, justifyContent: 'center' },
  linkText: { fontSize: 15, fontFamily: TITLE_FONT, color: colors.primary },
});
