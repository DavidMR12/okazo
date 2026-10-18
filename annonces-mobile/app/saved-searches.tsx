import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useDeleteSearch, useMarkSearchSeen, useSavedSearches } from '../src/api/hooks';
import type { SavedSearch } from '../src/api/types';
import { Message } from '../src/components/Message';
import { Text } from '../src/components/Typography';
import { colors, space, type } from '../src/theme';

/** Mes recherches : relancer une recherche en un geste, avec le nombre de nouvelles annonces. */
export default function SavedSearchesScreen() {
  const searches = useSavedSearches();
  const seen = useMarkSearchSeen();
  const del = useDeleteSearch();

  if (searches.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  if (searches.isError) return <Message title="Impossible de charger vos recherches" actionLabel="Réessayer" onAction={() => void searches.refetch()} />;
  if (!searches.data.length) {
    return <Message title="Aucune recherche sauvegardée" body="Lancez une recherche, réglez les filtres, puis touchez « Sauvegarder cette recherche »." />;
  }

  const open = (s: SavedSearch) => {
    if (s.newCount) seen.mutate(s.id); // les nouveautés repartent de zéro
    router.push({ pathname: '/search', params: { filters: JSON.stringify(s.query) } });
  };
  const remove = (s: SavedSearch) =>
    Alert.alert('Supprimer cette recherche ?', s.name, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => del.mutate(s.id) },
    ]);

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: space.sm }} style={{ backgroundColor: colors.bg }}>
      {searches.data.map((s) => (
        <View key={s.id} style={styles.row}>
          <Pressable onPress={() => open(s)} style={styles.main} accessibilityRole="button" accessibilityLabel={s.name}>
            <View style={styles.icon}>
              <Ionicons name="search" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.body} numberOfLines={2}>{s.name}</Text>
              {s.newCount ? (
                <Text style={styles.new}>{s.newCount === 1 ? '1 nouvelle annonce' : `${s.newCount} nouvelles annonces`}</Text>
              ) : (
                <Text style={type.small}>Pas de nouvelle annonce</Text>
              )}
            </View>
          </Pressable>
          <Pressable onPress={() => remove(s)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Supprimer la recherche ${s.name}`}>
            <Ionicons name="trash-outline" size={20} color={colors.inkMuted} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  new: { fontSize: 14, color: colors.primary },
});
