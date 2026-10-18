import { Image } from 'expo-image';
import { router, useIsFocused } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Typography';
import { useInbox } from '../../src/api/hooks';
import type { InboxItem } from '../../src/api/types';
import { useAuth } from '../../src/auth/AuthProvider';
import { Message } from '../../src/components/Message';
import { relativeTime } from '../../src/lib/format';
import { colors, space } from '../../src/theme';

export default function MessagesScreen() {
  const { status } = useAuth();
  const focused = useIsFocused();
  const inbox = useInbox(focused);
  const items = useMemo(() => inbox.data?.pages.flatMap((p) => p.items) ?? [], [inbox.data]);

  if (status !== 'signedIn') {
    return (
      <Message
        title="Vos conversations avec les vendeurs et les acheteurs"
        body="Connectez-vous pour écrire à un vendeur depuis une annonce."
        actionLabel="Se connecter"
        onAction={() => router.push('/login')}
      />
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <Row item={item} />}
      ListEmptyComponent={
        inbox.isPending ? (
          <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />
        ) : inbox.isError ? (
          <Message title="Impossible de charger vos messages" actionLabel="Réessayer" onAction={() => void inbox.refetch()} />
        ) : (
          <Message title="Aucune conversation" body="Touchez « Écrire au vendeur » sur une annonce pour commencer." />
        )
      }
      onEndReached={() => inbox.hasNextPage && !inbox.isFetchingNextPage && void inbox.fetchNextPage()}
      refreshControl={<RefreshControl refreshing={inbox.isRefetching && !inbox.isFetchingNextPage} onRefresh={() => void inbox.refetch()} tintColor={colors.primary} />}
      style={{ backgroundColor: colors.bg }}
    />
  );
}

function Row({ item }: { item: InboxItem }) {
  const name = item.other?.displayName ?? 'Utilisateur supprimé';
  return (
    <Pressable
      onPress={() => router.push(`/conversation/${item.id}`)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${item.listing.title}${item.unread ? ', non lu' : ''}`}
    >
      <Image source={item.listing.thumbnailUrl ?? undefined} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={[styles.name, item.unread && styles.bold]} numberOfLines={1}>{name}</Text>
          <Text style={styles.time}>{relativeTime(item.lastMessageAt)}</Text>
        </View>
        <Text style={styles.listing} numberOfLines={1}>
          {item.role === 'seller' ? 'Votre annonce : ' : ''}{item.listing.title}
        </Text>
        <View style={styles.line}>
          <Text style={[styles.preview, item.unread && styles.bold]} numberOfLines={1}>
            {item.lastFromMe ? 'Vous : ' : ''}{item.lastMessagePreview}
          </Text>
          {item.unread ? <View style={styles.dot} accessibilityElementsHidden /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.surface },
  body: { flex: 1, gap: 2, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flex: 1, fontSize: 16, color: colors.ink },
  bold: { fontWeight: '700', color: colors.ink },
  time: { fontSize: 12, color: colors.inkMuted },
  listing: { fontSize: 13, color: colors.inkMuted },
  preview: { flex: 1, fontSize: 14, color: colors.inkMuted },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
