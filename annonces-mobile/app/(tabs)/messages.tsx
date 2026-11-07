import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useIsFocused } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Typography';
import { useInbox } from '../../src/api/hooks';
import type { InboxItem } from '../../src/api/types';
import { useAuth } from '../../src/auth/AuthProvider';
import { CountBadge, DecorFooter, EmptyCard, initials } from '../../src/components/Blocks';
import { relativeTime } from '../../src/lib/format';
import { colors, space } from '../../src/theme';

type Tab = 'all' | 'buyer' | 'seller';
const TABS: [Tab, string][] = [['all', 'Toutes'], ['buyer', 'Mes achats'], ['seller', 'Mes ventes']];

/** Messages : onglets Toutes / Mes achats / Mes ventes, conversations en cartes (même direction artistique que le site). */
export default function MessagesScreen() {
  const { status } = useAuth();
  const focused = useIsFocused();
  const inbox = useInbox(focused);
  const items = useMemo(() => inbox.data?.pages.flatMap((p) => p.items) ?? [], [inbox.data]);
  const [tab, setTab] = useState<Tab>('all');

  if (status !== 'signedIn') {
    return (
      <View style={styles.padded}>
        <EmptyCard icon="chatbubbles-outline" decor={['chatbubble-outline', 'chatbubbles-outline', 'mail-outline', 'chatbubble-ellipses-outline', 'paper-plane-outline', 'happy-outline', 'chatbox-outline']} text="Connectez-vous pour écrire à un vendeur et retrouver vos conversations." action="Se connecter" onAction={() => router.push('/login')} />
      </View>
    );
  }

  const unread = items.filter((c) => c.unread).length;
  const shown = items.filter((c) => tab === 'all' || c.role === tab);

  return (
    <FlatList
      data={shown}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <Row item={item} />}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.head}>
          {unread ? <CountBadge label={`${unread} non lu${unread > 1 ? 's' : ''}`} /> : null}
          <View style={styles.seg} accessibilityRole="tablist">
            {TABS.map(([k, label]) => (
              <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
                <Text style={[styles.segText, tab === k && styles.segTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      }
      ListEmptyComponent={
        inbox.isPending ? (
          <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />
        ) : inbox.isError ? (
          <EmptyCard icon="cloud-offline-outline" text="Impossible de charger vos messages." action="Réessayer" onAction={() => void inbox.refetch()} />
        ) : (
          <EmptyCard
            icon="chatbubbles-outline"
            decor={['chatbubble-outline', 'chatbubbles-outline', 'mail-outline', 'chatbubble-ellipses-outline', 'paper-plane-outline', 'happy-outline', 'chatbox-outline']}
            text={items.length ? 'Aucune conversation dans cette rubrique.' : 'Aucune conversation pour l’instant. Touchez « Contacter » sur une annonce pour écrire au vendeur.'}
            action={items.length ? undefined : 'Voir les annonces'}
            onAction={items.length ? undefined : () => router.push('/')}
          />
        )
      }
      ListFooterComponent={shown.length > 0 && shown.length < 5 ? <DecorFooter icons={['chatbubble-outline', 'chatbubbles-outline', 'mail-outline', 'chatbubble-ellipses-outline', 'paper-plane-outline', 'happy-outline', 'chatbox-outline']} text="Écrivez aux vendeurs depuis leurs annonces : vos conversations s’affichent ici." /> : undefined}
      onEndReached={() => inbox.hasNextPage && !inbox.isFetchingNextPage && void inbox.fetchNextPage()}
      refreshControl={<RefreshControl refreshing={inbox.isRefetching && !inbox.isFetchingNextPage} onRefresh={() => void inbox.refetch()} tintColor={colors.primary} />}
      style={{ backgroundColor: colors.bg }}
    />
  );
}

function Row({ item }: { item: InboxItem }) {
  const name = item.other?.displayName ?? 'Utilisateur supprimé';
  const seller = item.role === 'seller';
  return (
    <Pressable
      onPress={() => router.push(`/conversation/${item.id}`)}
      style={({ pressed }) => [styles.card, item.unread && styles.cardUnread, pressed && { backgroundColor: colors.tint }]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${item.listing.title}${item.unread ? ', non lu' : ''}`}
    >
      <View style={styles.media}>
        {item.listing.thumbnailUrl ? (
          <Image source={item.listing.thumbnailUrl} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="image-outline" size={22} color={colors.inkMuted} />
          </View>
        )}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.time}>{relativeTime(item.lastMessageAt)}</Text>
        </View>
        <View style={styles.line}>
          <View style={[styles.tag, seller ? styles.tagSeller : styles.tagBuyer]}>
            <Text style={[styles.tagText, { color: seller ? colors.trust : colors.primary }]}>{seller ? 'Vente' : 'Achat'}</Text>
          </View>
          <Text style={styles.listing} numberOfLines={1}>{item.listing.title}</Text>
        </View>
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
  padded: { flex: 1, padding: space.lg, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  head: { gap: space.md, marginBottom: space.xs },
  seg: { flexDirection: 'row', alignSelf: 'center', padding: 4, borderRadius: 14, backgroundColor: colors.tint, gap: 4 },
  segBtn: { alignItems: 'center', paddingVertical: 9, paddingHorizontal: 16, borderRadius: 10 },
  segOn: { backgroundColor: '#fff', shadowColor: '#1E3A8A', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  segText: { fontSize: 14, fontWeight: '600', color: colors.inkMuted },
  segTextOn: { color: colors.primary },
  card: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: 18,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: '#E6EDF8',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardUnread: { backgroundColor: '#F5F8FF', borderColor: colors.tintLine },
  media: { width: 60, height: 60 },
  thumb: { width: 60, height: 60, borderRadius: 14, backgroundColor: colors.tint },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  avatar: { position: 'absolute', right: -6, bottom: -6, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.navy, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  body: { flex: 1, gap: 3, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  bold: { fontWeight: '700', color: colors.ink },
  time: { fontSize: 12, color: colors.inkMuted },
  tag: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6 },
  tagBuyer: { backgroundColor: '#E7F0FF' },
  tagSeller: { backgroundColor: '#E3F6EC' },
  tagText: { fontSize: 11, fontWeight: '700' },
  listing: { flex: 1, fontSize: 13, color: colors.inkMuted },
  preview: { flex: 1, fontSize: 14, color: colors.inkMuted },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
