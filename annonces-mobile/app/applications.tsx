import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useMyApplications } from '../src/api/hooks';
import { Message } from '../src/components/Message';
import { Text } from '../src/components/Typography';
import { CANDIDATE_STATUS } from '../src/lib/applications';
import { relativeTime } from '../src/lib/format';
import { colors, space, TITLE_FONT, type } from '../src/theme';

/** Mes candidatures : les offres auxquelles j'ai postulé, avec leur statut. */
export default function MyApplicationsScreen() {
  const apps = useMyApplications();

  if (apps.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  if (apps.isError) return <Message title="Impossible de charger vos candidatures" actionLabel="Réessayer" onAction={() => void apps.refetch()} />;

  return (
    <FlatList
      data={apps.data}
      keyExtractor={(a) => a.id}
      style={{ backgroundColor: colors.bg }}
      refreshControl={<RefreshControl refreshing={apps.isRefetching} onRefresh={() => void apps.refetch()} tintColor={colors.primary} />}
      ListEmptyComponent={<Message title="Aucune candidature" body="Dans la catégorie Emploi, ouvrez une offre et touchez « Postuler »." />}
      renderItem={({ item }) => {
        const s = CANDIDATE_STATUS[item.status];
        return (
          <Pressable
            style={styles.row}
            onPress={() => router.push(item.conversationId ? `/conversation/${item.conversationId}` : `/listing/${item.listingId}`)}
            accessibilityRole="button"
            accessibilityLabel={`${item.listingTitle}, ${s.label}`}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.title} numberOfLines={2}>{item.listingTitle}</Text>
              <Text style={type.small}>
                Envoyée {relativeTime(item.createdAt)}
                {item.hasCv ? ' · CV joint' : ''}
                {item.listingStatus !== 'active' ? ' · offre close' : ''}
              </Text>
              <Text style={[styles.badge, { color: s.color, backgroundColor: s.bg }]}>{s.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  title: { fontSize: 15, lineHeight: 20, fontFamily: TITLE_FONT, color: colors.ink },
  badge: { alignSelf: 'flex-start', fontSize: 13, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
});
