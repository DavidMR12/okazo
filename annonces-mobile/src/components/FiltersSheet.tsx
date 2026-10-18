import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCategories, useCities, useCountries, useDistricts, useListingCount } from '../api/hooks';
import type { FeedFilters, FormField } from '../api/types';
import { adTypeLabels } from '../lib/adType';
import { CONDITION_LABELS, shortCategory } from '../lib/format';
import { colors, space, type } from '../theme';
import { Button } from './Button';
import { Chip } from './Chip';
import { Text, TextInput } from './Typography';
import { walletName } from './Wallets';

/**
 * Écran Filtres (comme sur LeBonCoin) : on règle un brouillon, le nombre de résultats se met à jour,
 * et « Voir les N annonces » applique les filtres.
 */
export function FiltersSheet({
  visible,
  value,
  onClose,
  onApply,
}: {
  visible: boolean;
  value: FeedFilters;
  onClose: () => void;
  onApply: (f: FeedFilters) => void;
}) {
  const insets = useSafeAreaInsets();
  const categories = useCategories();
  const [d, setD] = useState<FeedFilters>(value);
  const countries = useCountries();
  const cities = useCities(d.country);
  const districts = useDistricts(d.cityId);

  // Chaque ouverture repart des filtres appliqués
  useEffect(() => {
    if (visible) setD(value);
  }, [visible, value]);

  // Nombre de résultats : recalculé 400 ms après le dernier réglage (moins de requêtes sur réseau lent)
  const [counted, setCounted] = useState<FeedFilters>(value);
  useEffect(() => {
    const t = setTimeout(() => setCounted(d), 400);
    return () => clearTimeout(t);
  }, [d]);
  const count = useListingCount(counted, visible);

  const parents = categories.data ?? [];
  const parent = parents.find((c) => c.id === d.categoryId || c.children?.some((x) => x.id === d.categoryId));
  const sub = parent?.children?.find((c) => c.id === d.categoryId);
  const form = sub?.form ?? parent?.form;
  const filterFields = (form?.fields ?? []).filter((f) => f.filter);
  const set = (patch: Partial<FeedFilters>) => setD((x) => ({ ...x, ...patch }));
  const setAttr = (k: string, v: string | undefined) => setD((x) => ({ ...x, attrs: { ...(x.attrs ?? {}), [k]: v ?? '' } }));
  const conditions = (d.condition ?? '').split(',').filter(Boolean);
  const labels = adTypeLabels(parent?.slug);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.head}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer">
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
        <Text style={type.heading}>Filtres</Text>
        <Pressable onPress={() => setD({ country: value.country, q: value.q, sort: value.sort })} hitSlop={12} accessibilityRole="button">
          <Text style={styles.reset}>Effacer</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Section title="Type d’annonce">
          <View style={styles.wrap}>
            <Chip label="Toutes" selected={!d.adType} onPress={() => set({ adType: undefined })} />
            <Chip label={parent ? labels.offer : 'Offres'} selected={d.adType === 'offer'} onPress={() => set({ adType: 'offer' })} />
            <Chip label={parent ? labels.request : 'Demandes'} selected={d.adType === 'request'} onPress={() => set({ adType: 'request' })} />
          </View>
        </Section>

        <Section title="Catégorie">
          <View style={styles.wrap}>
            <Chip label="Toutes" selected={!parent} onPress={() => set({ categoryId: undefined, attrs: {}, condition: undefined })} />
            {parents.map((c) => (
              <Chip
                key={c.id}
                label={shortCategory(c.name)}
                selected={parent?.id === c.id}
                onPress={() => set({ categoryId: c.id, attrs: {}, condition: undefined })}
              />
            ))}
          </View>
          {parent?.children?.length ? (
            <View style={[styles.wrap, styles.sub]}>
              <Chip label={`Tout « ${shortCategory(parent.name)} »`} selected={!sub} onPress={() => set({ categoryId: parent.id, attrs: {} })} />
              {parent.children.map((c) => (
                <Chip key={c.id} label={c.name} selected={sub?.id === c.id} onPress={() => set({ categoryId: c.id, attrs: {} })} />
              ))}
            </View>
          ) : null}
        </Section>

        <Section title="Lieu">
          {/* Pays : tous par défaut, puis les villes du pays choisi */}
          <View style={styles.wrap}>
            <Chip label="Tous les pays" selected={!d.country} onPress={() => set({ country: undefined, cityId: undefined, districtId: undefined })} />
            {countries.data?.map((c) => (
              <Chip key={c.code} label={c.name} selected={d.country === c.code} onPress={() => set({ country: c.code, cityId: undefined, districtId: undefined })} />
            ))}
          </View>
          {d.country ? (
            <View style={[styles.wrap, styles.sub]}>
              <Chip label="Tout le pays" selected={!d.cityId} onPress={() => set({ cityId: undefined, districtId: undefined })} />
              {cities.data?.map((c) => (
                <Chip key={c.id} label={c.name} selected={d.cityId === c.id} onPress={() => set({ cityId: c.id, districtId: undefined })} />
              ))}
            </View>
          ) : null}
        {d.cityId && districts.data?.length ? (
            <View style={[styles.wrap, styles.sub]}>
              <Chip label="Tous les quartiers" selected={!d.districtId} onPress={() => set({ districtId: undefined })} />
              {districts.data.map((x) => (
                <Chip key={x.id} label={x.name} selected={d.districtId === x.id} onPress={() => set({ districtId: x.id })} />
              ))}
            </View>
          ) : null}
        </Section>

        {parent?.slug !== 'emploi' && d.country && (countries.data?.find((c) => c.code === d.country)?.wallets ?? []).length ? (
          <Section title="Paiement électronique">
            <View style={styles.wrap}>
              <Chip label="Tous" selected={!d.wallet} onPress={() => set({ wallet: undefined })} />
              {(countries.data?.find((c) => c.code === d.country)?.wallets ?? []).map((w) => (
                <Chip key={w} label={walletName(w)} selected={d.wallet === w} onPress={() => set({ wallet: d.wallet === w ? undefined : w })} />
              ))}
            </View>
          </Section>
        ) : null}

        {!['emploi', 'services', 'immobilier'].includes(parent?.slug ?? '') ? (
          <Section title="Mode de remise">
            <View style={styles.wrap}>
              <Chip label="Remise en main propre" selected={!!d.handDelivery} onPress={() => set({ handDelivery: d.handDelivery ? undefined : true })} />
            </View>
          </Section>
        ) : null}

        <Section title={form?.price.label ?? 'Prix'}>
          <Range unit="FCFA" min={d.minPrice} max={d.maxPrice} onChange={(min, max) => set({ minPrice: min, maxPrice: max })} />
        </Section>

        {form?.condition !== false ? (
          <Section title="État">
            <View style={styles.wrap}>
              {Object.entries(CONDITION_LABELS).map(([v, label]) => {
                const on = conditions.includes(v);
                return (
                  <Chip
                    key={v}
                    label={label}
                    selected={on}
                    onPress={() =>
                      set({
                        condition: (on ? conditions.filter((x) => x !== v) : [...conditions, v]).join(',') || undefined,
                      })
                    }
                  />
                );
              })}
            </View>
          </Section>
        ) : null}

        {filterFields.map((f) => (
          <AttributeFilter key={f.key} field={f} attrs={d.attrs ?? {}} onChange={setAttr} />
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>
        <Button
          label={
            count.data === undefined
              ? 'Voir les annonces'
              : count.data === 0
                ? 'Aucune annonce'
                : `Voir ${count.data === 1 ? 'l’annonce' : `les ${count.data} annonces`}`
          }
          onPress={() => onApply(d)}
          disabled={count.data === 0}
        />
      </View>
    </Modal>
  );
}

/** Filtre d'un champ de catégorie : plusieurs choix pour une liste, minimum/maximum pour un nombre. */
function AttributeFilter({
  field,
  attrs,
  onChange,
}: {
  field: FormField;
  attrs: Record<string, string>;
  onChange: (k: string, v: string | undefined) => void;
}) {
  if (field.type === 'select') {
    const picked = (attrs[field.key] ?? '').split(',').filter(Boolean);
    return (
      <Section title={field.label}>
        <View style={styles.wrap}>
          {field.options.map((o) => {
            const on = picked.includes(o.value);
            return (
              <Chip
                key={o.value}
                label={o.label}
                selected={on}
                onPress={() => onChange(field.key, (on ? picked.filter((x) => x !== o.value) : [...picked, o.value]).join(',') || undefined)}
              />
            );
          })}
        </View>
      </Section>
    );
  }
  if (field.type === 'number') {
    const num = (k: string) => (attrs[k] ? Number(attrs[k]) : undefined);
    return (
      <Section title={field.label}>
        <Range
          unit={field.unit}
          min={num(`${field.key}_min`)}
          max={num(`${field.key}_max`)}
          onChange={(min, max) => {
            onChange(`${field.key}_min`, min === undefined ? undefined : String(min));
            onChange(`${field.key}_max`, max === undefined ? undefined : String(max));
          }}
        />
      </Section>
    );
  }
  return null; // les champs texte ne sont pas filtrables
}

function Range({ unit, min, max, onChange }: { unit?: string; min?: number; max?: number; onChange: (min?: number, max?: number) => void }) {
  const parse = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    return digits ? Number(digits) : undefined;
  };
  return (
    <View style={styles.range}>
      <TextInput
        value={min === undefined ? '' : String(min)}
        onChangeText={(v) => onChange(parse(v), max)}
        placeholder="Min."
        placeholderTextColor={colors.inkMuted}
        keyboardType="number-pad"
        style={styles.input}
      />
      <Text style={type.small}>à</Text>
      <TextInput
        value={max === undefined ? '' : String(max)}
        onChangeText={(v) => onChange(min, parse(v))}
        placeholder="Max."
        placeholderTextColor={colors.inkMuted}
        keyboardType="number-pad"
        style={styles.input}
      />
      {unit ? <Text style={type.small}>{unit}</Text> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={type.heading}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  reset: { fontSize: 15, color: colors.primary },
  body: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  sub: {
    paddingLeft: space.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.line,
  },
  range: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: space.md,
    minHeight: 46,
    fontSize: 16,
    color: colors.ink,
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
