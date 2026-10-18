import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Text } from './Typography';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Cadre de la page d'annonce (maquette du porteur, 18 octobre 2026) : bandeau bleu pâle avec une pastille
 * bleu marine et son icône, le titre, et à droite une étiquette facultative (type d'annonce).
 */
export function DetailCard({ icon, title, chip, chipIcon, children }: { icon: IconName; title: string; chip?: string; chipIcon?: IconName; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.band}>
        <View style={styles.iconTile}>
          <Ionicons name={icon} size={20} color="#fff" />
        </View>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {chip ? (
          <View style={styles.chip}>
            {chipIcon ? <Ionicons name={chipIcon} size={15} color={colors.primary} /> : null}
            <Text style={styles.chipText} numberOfLines={1}>{chip}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

// Icône de chaque caractéristique (clé du formulaire de la catégorie)
const FACT_ICONS: Record<string, IconName> = {
  category: 'grid-outline', condition: 'sparkles-outline', brand: 'pricetag-outline', model: 'cube-outline', storage: 'server-outline',
  ram: 'hardware-chip-outline', year: 'calendar-outline', mileage: 'speedometer-outline', fuel: 'flame-outline', gearbox: 'cog-outline',
  engine: 'flash-outline', customs: 'shield-checkmark-outline', title_deed: 'document-text-outline', surface: 'triangle-outline',
  area: 'triangle-outline', deal: 'swap-horizontal-outline', property_type: 'home-outline', rooms: 'bed-outline', bedrooms: 'bed-outline',
  furnished: 'cube-outline', advance_months: 'cash-outline', size: 'resize-outline', shoe_size: 'footsteps-outline', sector: 'briefcase-outline',
  contract: 'document-outline', schedule: 'time-outline', experience: 'ribbon-outline', education: 'school-outline', rate_unit: 'time-outline',
  place: 'location-outline', availability: 'calendar-number-outline', age: 'hourglass-outline',
};

/** Caractéristiques sur deux colonnes, chacune avec son icône, séparées par un trait vertical. */
export function FactGrid({ facts }: { facts: { key: string; label: string; value: string }[] }) {
  const left = facts.filter((_, i) => i % 2 === 0);
  const right = facts.filter((_, i) => i % 2 === 1);
  const col = (items: typeof facts) => (
    <View style={styles.col}>
      {items.map((f) => (
        <View key={f.key} style={styles.fact}>
          <View style={styles.factIcon}>
            <Ionicons name={FACT_ICONS[f.key] ?? 'information-circle-outline'} size={20} color={colors.navy} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.factLabel} numberOfLines={1}>{f.label}</Text>
            <Text style={styles.factValue} numberOfLines={3}>{f.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
  return (
    <View style={styles.grid}>
      {col(left)}
      {right.length ? <View style={styles.divider} /> : null}
      {right.length ? col(right) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E6EDF8',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  band: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: colors.tint },
  iconTile: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  title: { flexShrink: 0, fontSize: 17, fontWeight: '700', color: colors.ink }, // titre entier ; c'est l'étiquette qui se raccourcit
  chip: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: '#DCE8FD', flexShrink: 1, maxWidth: '42%' },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.primary, flexShrink: 1 },
  body: { paddingHorizontal: 8, paddingTop: 14, paddingBottom: 8 },
  grid: { flexDirection: 'row' },
  col: { flex: 1, gap: 18 },
  divider: { width: 1, backgroundColor: colors.line, marginHorizontal: 12 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  factIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  factLabel: { fontSize: 13, color: colors.inkMuted, fontWeight: '400' },
  factValue: { fontSize: 15, color: colors.ink, fontWeight: '700' },
});
