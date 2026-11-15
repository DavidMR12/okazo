import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ComponentRef } from 'react';
import { ApiError } from '../api/client';
import { useCategories, useCities, useSaveSearch } from '../api/hooks';
import type { FeedFilters } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { activeCount, describe } from '../lib/filters';
import { colors, space } from '../theme';
import { Chip } from './Chip';
import { FiltersSheet } from './FiltersSheet';
import { ListingFeed } from './ListingFeed';
import { Text, TextInput } from './Typography';
import { dialog } from './Dialog';

const SORTS = [
  { value: 'recent', label: 'Plus récentes' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
] as const;

/**
 * Résultats de recherche (écran Recherche et pages de catégorie) : recherche par mot, filtres,
 * tri, sauvegarde de la recherche, puis la liste.
 */
export function SearchResults({ initial, autoFocus, openFilters }: { initial: FeedFilters; autoFocus?: boolean; openFilters?: boolean }) {
  const { status } = useAuth();
  const categories = useCategories();
  const [filters, setFilters] = useState<FeedFilters>(initial);
  const cities = useCities(filters.country);
  const [search, setSearch] = useState(initial.q ?? '');
  const [sheet, setSheet] = useState(!!openFilters);
  const [saved, setSaved] = useState(false);
  const save = useSaveSearch();

  // Recherche par mot lancée 400 ms après la dernière frappe
  useEffect(() => {
    const t = setTimeout(() => {
      const q = search.trim().length >= 2 ? search.trim() : undefined;
      setFilters((f) => (f.q === q ? f : { ...f, q }));
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Loupe ou touche « Rechercher » du clavier : recherche immédiate et clavier fermé ; champ vide : on l'ouvre
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const submit = () => {
    const q = search.trim().length >= 2 ? search.trim() : undefined;
    if (!search.trim()) {
      input.current?.focus();
      return;
    }
    Keyboard.dismiss();
    setFilters((f) => (f.q === q ? f : { ...f, q }));
  };

  // Une recherche modifiée peut être sauvegardée à nouveau
  useEffect(() => setSaved(false), [filters]);

  const n = activeCount(filters);
  const query = useMemo(() => filters, [filters]);

  const onSave = () => {
    if (status !== 'signedIn') {
      router.push('/login');
      return;
    }
    const name = describe(filters, categories.data ?? [], cities.data ?? []);
    save.mutate(
      { name, filters },
      {
        onSuccess: () => {
          setSaved(true);
          dialog('Recherche sauvegardée', `« ${name} »\nRetrouvez-la dans Compte, puis Mes recherches : les nouvelles annonces y sont signalées.`);
        },
        onError: (e) => dialog('Recherche', e instanceof ApiError ? e.message : 'Sauvegarde impossible.'),
      },
    );
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <TextInput
            ref={input}
            value={search}
            onChangeText={setSearch}
            placeholder="Que recherchez-vous ?"
            placeholderTextColor={colors.inkMuted}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={submit}
            autoCorrect={false}
            autoFocus={autoFocus}
            accessibilityLabel="Rechercher une annonce"
          />
          {search ? <Ionicons name="close-circle" size={18} color={colors.inkMuted} onPress={() => setSearch('')} /> : null}
          <Pressable onPress={submit} style={({ pressed }) => [styles.searchBtn, pressed && { backgroundColor: colors.primaryPressed }]} hitSlop={6} accessibilityRole="button" accessibilityLabel="Lancer la recherche">
            <Ionicons name="search" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
        <Pressable onPress={() => setSheet(true)} style={styles.filterBtn} accessibilityRole="button" accessibilityLabel={`Filtres${n ? ` (${n} actifs)` : ''}`}>
          <Ionicons name="options-outline" size={22} color={colors.primary} />
          {n ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{n}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {SORTS.map((s) => (
          <Chip key={s.value} label={s.label} selected={(filters.sort ?? 'recent') === s.value} onPress={() => setFilters((f) => ({ ...f, sort: s.value }))} />
        ))}
      </ScrollView>

      <Pressable onPress={onSave} disabled={saved || save.isPending} style={styles.save} accessibilityRole="button">
        <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={colors.primary} />
        <Text style={styles.saveText}>{saved ? 'Recherche sauvegardée' : 'Sauvegarder cette recherche'}</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <ListingFeed
        filters={query}
        header={header}
        empty={{
          title: 'Aucune annonce pour cette recherche',
          body: n ? 'Retirez un filtre ou élargissez le lieu.' : 'Essayez un autre mot.',
          actionLabel: n ? 'Modifier les filtres' : undefined,
          onAction: n ? () => setSheet(true) : undefined,
        }}
      />
      <FiltersSheet
        visible={sheet}
        value={filters}
        onClose={() => setSheet(false)}
        onApply={(f) => {
          setFilters(f);
          setSheet(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.md, paddingBottom: space.sm, gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg },
  search: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.tintLine, flexDirection: 'row', alignItems: 'center', paddingLeft: space.md, paddingRight: 5, gap: space.sm },
  // Loupe bleue à droite du champ, comme sur le site : elle lance la recherche
  searchBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, fontSize: 16, color: colors.ink },
  filterBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: colors.bg, fontSize: 11 },
  chips: { paddingHorizontal: space.lg, gap: space.sm },
  save: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.lg, alignSelf: 'flex-start' },
  saveText: { color: colors.primary, fontSize: 14 },
});
