import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useSellerReviews } from '../../src/api/hooks';
import { Message } from '../../src/components/Message';
import { ReviewItem } from '../../src/components/ReviewItem';
import { RatingSummary } from '../../src/components/Stars';
import { Text } from '../../src/components/Typography';
import { colors, space } from '../../src/theme';

/** Tous les avis reçus par un utilisateur, avec la répartition des notes. */
export default function ReviewsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useSellerReviews(id);

  if (q.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  if (q.isError) return <Message title="Impossible de charger les avis" actionLabel="Réessayer" onAction={() => void q.refetch()} />;
  const summary = q.data.pages[0].summary;
  const items = q.data.pages.flatMap((p) => p.items);
  const max = Math.max(1, ...Object.values(summary.distribution ?? {}));

  return (
    <FlatList
      data={items}
      keyExtractor={(r) => r.id}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      ListHeaderComponent={
        <View style={styles.summary}>
          <RatingSummary avg={summary.average} count={summary.count} />
          {[5, 4, 3, 2, 1].map((n) => {
            const c = summary.distribution?.[String(n)] ?? 0;
            return (
              <View key={n} style={styles.barRow} accessible accessibilityLabel={`${n} étoiles : ${c} avis`}>
                <Text style={styles.barLabel}>{n} ★</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${(c / max) * 100}%` }]} />
                </View>
                <Text style={styles.barCount}>{c}</Text>
              </View>
            );
          })}
        </View>
      }
      ListEmptyComponent={<Message title="Pas encore d’avis" body="Les avis sont donnés après un échange dans la messagerie." />}
      renderItem={({ item }) => <ReviewItem review={item} />}
      ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ margin: space.lg }} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  summary: { paddingVertical: space.lg, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barLabel: { width: 34, fontSize: 13, color: colors.inkMuted },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.tint, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#F5B700' },
  barCount: { width: 28, textAlign: 'right', fontSize: 13, color: colors.inkMuted },
});
