import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useCategories } from '../src/api/hooks';
import { Text } from '../src/components/Typography';
import { categoryIcon } from '../src/lib/categoryIcons';
import { colors, space, type } from '../src/theme';

/** Toutes les catégories (tuile « Autres » de l'accueil). */
export default function CategoriesScreen() {
  const categories = useCategories();
  if (categories.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  return (
    <ScrollView contentContainerStyle={{ paddingVertical: space.sm }} style={{ backgroundColor: colors.bg }}>
      {categories.data?.map((c) => (
        <Pressable key={c.id} onPress={() => router.push(`/category/${c.id}`)} style={styles.row} accessibilityRole="button">
          <View style={styles.icon}>
            <Ionicons name={categoryIcon(c.slug)} size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.body}>{c.name}</Text>
            {c.children?.length ? (
              <Text style={type.small} numberOfLines={1}>
                {c.children.map((x) => x.name).join(', ')}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
});
