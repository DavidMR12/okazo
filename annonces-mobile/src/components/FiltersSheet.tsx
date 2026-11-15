import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCategories, useCities, useCountries, useDistricts, useListingCount } from '../api/hooks';
import type { FeedFilters, FormField } from '../api/types';
import { adTypeLabels } from '../lib/adType';
import { categoryIcon } from '../lib/categoryIcons';
import { CONDITION_LABELS, shortCategory } from '../lib/format';
import { colors, space, TITLE_FONT, TITLE_FONT_REGULAR } from '../theme';
import { Button } from './Button';
import { Text, TextInput } from './Typography';
import { walletName } from './Wallets';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Écran Filtres : chaque rubrique dans une carte avec son icône, textes en Outfit (comme le site).
 * On règle un brouillon, le nombre de résultats se met à jour, et « Voir les N annonces » applique les filtres.
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
  const wallets = countries.data?.find((c) => c.code === d.country)?.wallets ?? [];
  const cityName = cities.data?.find((c) => c.id === d.cityId)?.name;

  // Nombre de filtres réglés, affiché sur « Effacer »
  const active =
    [d.adType, d.categoryId, d.cityId, d.districtId, d.wallet, d.handDelivery, d.minPrice ?? d.maxPrice, d.condition].filter(
      (x) => x !== undefined && x !== '',
    ).length + Object.values(d.attrs ?? {}).filter(Boolean).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.head}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.headBtn}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headTitle}>Filtres</Text>
        <Pressable
          onPress={() => setD({ country: value.country, q: value.q, sort: value.sort })}
          hitSlop={12}
          accessibilityRole="button"
          disabled={!active}
          style={[styles.resetBtn, !active && { opacity: 0.45 }]}
        >
          <Text style={styles.reset}>Effacer{active ? ` (${active})` : ''}</Text>
        </Pressable>
      </View>

      <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Section title="Type d’annonce" icon="swap-horizontal">
          <Segmented
            options={[
              { label: 'Toutes', on: !d.adType, press: () => set({ adType: undefined }) },
              { label: parent ? labels.offer : 'Offres', on: d.adType === 'offer', press: () => set({ adType: 'offer' }) },
              { label: parent ? labels.request : 'Demandes', on: d.adType === 'request', press: () => set({ adType: 'request' }) },
            ]}
          />
        </Section>

        <Section title="Catégorie" icon="grid" hint={parent ? shortCategory(parent.name) : undefined}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catRow}>
            <CatTile label="Toutes" icon="apps" on={!parent} onPress={() => set({ categoryId: undefined, attrs: {}, condition: undefined })} />
            {parents.map((c) => (
              <CatTile
                key={c.id}
                label={shortCategory(c.name)}
                icon={categoryIcon(c.slug)}
                on={parent?.id === c.id}
                onPress={() => set({ categoryId: c.id, attrs: {}, condition: undefined })}
              />
            ))}
          </ScrollView>
          {parent?.children?.length ? (
            <View style={styles.subBox}>
              <Text style={styles.subTitle}>Sous-catégorie</Text>
              <View style={styles.wrap}>
                <Pill label={`Tout « ${shortCategory(parent.name)} »`} on={!sub} onPress={() => set({ categoryId: parent.id, attrs: {} })} />
                {parent.children.map((c) => (
                  <Pill key={c.id} label={c.name} on={sub?.id === c.id} onPress={() => set({ categoryId: c.id, attrs: {} })} />
                ))}
              </View>
            </View>
          ) : null}
        </Section>

        <Section title="Lieu" icon="location" hint={cityName}>
          {/* Seulement les villes du pays de l'utilisateur (comme Uber) : aucun autre pays n'est proposé */}
          {d.country ? (
            <View style={styles.wrap}>
              <Pill label="Tout le pays" icon="globe-outline" on={!d.cityId} onPress={() => set({ cityId: undefined, districtId: undefined })} />
              {cities.data?.map((c) => (
                <Pill key={c.id} label={c.name} on={d.cityId === c.id} onPress={() => set({ cityId: c.id, districtId: undefined })} />
              ))}
            </View>
          ) : null}
          {d.cityId && districts.data?.length ? (
            <View style={styles.subBox}>
              <Text style={styles.subTitle}>Quartier{cityName ? ` à ${cityName}` : ''}</Text>
              <View style={styles.wrap}>
                <Pill label="Tous les quartiers" on={!d.districtId} onPress={() => set({ districtId: undefined })} />
                {districts.data.map((x) => (
                  <Pill key={x.id} label={x.name} on={d.districtId === x.id} onPress={() => set({ districtId: x.id })} />
                ))}
              </View>
            </View>
          ) : null}
        </Section>

        <Section title={form?.price.label ?? 'Prix'} icon="pricetag">
          <Range unit="FCFA" min={d.minPrice} max={d.maxPrice} onChange={(min, max) => set({ minPrice: min, maxPrice: max })} />
        </Section>

        {form?.condition !== false ? (
          <Section title="État" icon="sparkles">
            <View style={styles.wrap}>
              {Object.entries(CONDITION_LABELS).map(([v, label]) => {
                const on = conditions.includes(v);
                return (
                  <Pill
                    key={v}
                    label={label}
                    on={on}
                    onPress={() => set({ condition: (on ? conditions.filter((x) => x !== v) : [...conditions, v]).join(',') || undefined })}
                  />
                );
              })}
            </View>
          </Section>
        ) : null}

        {parent?.slug !== 'emploi' && d.country && wallets.length ? (
          <Section title="Paiement électronique" icon="phone-portrait">
            <View style={styles.wrap}>
              <Pill label="Tous" on={!d.wallet} onPress={() => set({ wallet: undefined })} />
              {wallets.map((w) => (
                <Pill key={w} label={walletName(w)} on={d.wallet === w} onPress={() => set({ wallet: d.wallet === w ? undefined : w })} />
              ))}
            </View>
          </Section>
        ) : null}

        {!['emploi', 'services', 'immobilier'].includes(parent?.slug ?? '') ? (
          <Section title="Mode de remise" icon="hand-left">
            <Pressable
              onPress={() => set({ handDelivery: d.handDelivery ? undefined : true })}
              style={styles.toggleRow}
              accessibilityRole="switch"
              accessibilityState={{ checked: !!d.handDelivery }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Remise en main propre</Text>
                <Text style={styles.toggleHint}>Rencontrer le vendeur pour récupérer l’article</Text>
              </View>
              <View style={[styles.switch, d.handDelivery && styles.switchOn]}>
                <View style={[styles.knob, d.handDelivery && styles.knobOn]} />
              </View>
            </Pressable>
          </Section>
        ) : null}

        {filterFields.map((f) => (
          <AttributeFilter key={f.key} field={f} attrs={d.attrs ?? {}} onChange={setAttr} />
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>
        <Button
          icon="search"
          bold
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
      <Section title={field.label} icon="options">
        <View style={styles.wrap}>
          {field.options.map((o) => {
            const on = picked.includes(o.value);
            return (
              <Pill
                key={o.value}
                label={o.label}
                on={on}
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
      <Section title={field.label} icon="options">
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
      <View style={styles.inputBox}>
        <Text style={styles.inputCap}>Minimum</Text>
        <TextInput
          value={min === undefined ? '' : String(min)}
          onChangeText={(v) => onChange(parse(v), max)}
          placeholder="0"
          placeholderTextColor={colors.inkMuted}
          keyboardType="number-pad"
          style={styles.input}
        />
      </View>
      <View style={styles.dash} />
      <View style={styles.inputBox}>
        <Text style={styles.inputCap}>Maximum</Text>
        <TextInput
          value={max === undefined ? '' : String(max)}
          onChangeText={(v) => onChange(min, parse(v))}
          placeholder="Sans limite"
          placeholderTextColor={colors.inkMuted}
          keyboardType="number-pad"
          style={styles.input}
        />
      </View>
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
    </View>
  );
}

/** Carte blanche d'une rubrique : pastille d'icône, titre en Outfit, choix en cours à droite. */
function Section({ title, icon, hint, children }: { title: string; icon: IconName; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Ionicons name={icon} size={16} color={colors.primary} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
        {hint ? (
          <Text style={styles.cardHint} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Sélecteur segmenté (Toutes / Offres / Demandes). */
function Segmented({ options }: { options: { label: string; on: boolean; press: () => void }[] }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable key={o.label} onPress={o.press} style={[styles.segItem, o.on && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: o.on }}>
          <Text style={[styles.segLabel, o.on && styles.segLabelOn]} numberOfLines={1}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Tuile de catégorie avec son icône, comme la grille de l'accueil. */
function CatTile({ label, icon, on, onPress }: { label: string; icon: IconName; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.cat, on && styles.catOn]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label}>
      <Ionicons name={icon} size={24} color={on ? '#FFFFFF' : colors.primary} />
      <View style={styles.catLabelBox}>
        <Text style={[styles.catLabel, on && { color: '#FFFFFF' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** Pastille de choix : bleue avec une coche quand elle est choisie. */
function Pill({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, on && styles.pillOn]} accessibilityRole="button" accessibilityState={{ selected: on }} hitSlop={4}>
      {on ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : icon ? <Ionicons name={icon} size={15} color={colors.primary} /> : null}
      <Text style={[styles.pillLabel, on && styles.pillLabelOn]}>{label}</Text>
    </Pressable>
  );
}

const shadow = { shadowColor: '#132F6B', shadowOffset: { width: 0, height: 3 } };

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  headBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 20, fontFamily: TITLE_FONT, color: colors.ink },
  resetBtn: { paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: colors.tint, justifyContent: 'center' },
  reset: { fontSize: 14, fontFamily: TITLE_FONT, color: colors.primary },
  body: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
  card: { backgroundColor: colors.bg, borderRadius: 18, padding: space.lg, gap: space.md, ...shadow, shadowOpacity: 0.06, shadowRadius: 10, elevation: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 17, fontFamily: TITLE_FONT, color: colors.ink, flex: 1 },
  cardHint: { fontSize: 14, fontFamily: TITLE_FONT, color: colors.primary, maxWidth: '45%' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  subBox: { gap: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  subTitle: { fontSize: 12, fontFamily: TITLE_FONT, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4 },
  segItem: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segOn: { backgroundColor: colors.bg, ...shadow, shadowOpacity: 0.12, shadowRadius: 6, elevation: 2 },
  segLabel: { fontSize: 15, fontFamily: TITLE_FONT_REGULAR, color: colors.inkMuted },
  segLabelOn: { fontFamily: TITLE_FONT, color: colors.primary },
  catScroll: { marginHorizontal: -space.lg },
  catRow: { gap: space.sm, paddingHorizontal: space.lg },
  cat: { width: 88, height: 84, borderRadius: 16, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  catOn: { backgroundColor: colors.primary },
  catLabelBox: { height: 18, alignSelf: 'stretch', justifyContent: 'center' },
  catLabel: { fontSize: 13, fontFamily: TITLE_FONT, color: colors.ink, textAlign: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.tintLine,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillLabel: { fontSize: 15, fontFamily: TITLE_FONT_REGULAR, color: colors.ink },
  pillLabelOn: { fontFamily: TITLE_FONT, color: '#FFFFFF' },
  range: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  inputBox: { flex: 1, minWidth: 0, gap: 4 },
  inputCap: { fontSize: 12, fontFamily: TITLE_FONT, color: colors.inkMuted },
  input: {
    borderWidth: 1.5,
    borderColor: colors.tintLine,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: space.md,
    minHeight: 46,
    fontSize: 16,
    fontFamily: TITLE_FONT,
    color: colors.ink,
  },
  dash: { width: 10, height: 2, borderRadius: 1, backgroundColor: colors.inkMuted, marginBottom: 22 },
  unit: { fontSize: 13, fontFamily: TITLE_FONT, color: colors.inkMuted, marginBottom: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  toggleLabel: { fontSize: 15, fontFamily: TITLE_FONT, color: colors.ink },
  toggleHint: { fontSize: 13, fontFamily: TITLE_FONT_REGULAR, color: colors.inkMuted, marginTop: 2 },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.line, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
  knobOn: { alignSelf: 'flex-end' },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
