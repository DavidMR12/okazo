import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ApiError } from '../../src/api/client';
import { useCart, useToggleCart } from '../../src/api/hooks';
import type { CartSeller } from '../../src/api/types';
import { useAuth } from '../../src/auth/AuthProvider';
import { Avatar, cardShadow, CountBadge, EmptyCard, SafetyNote } from '../../src/components/Blocks';
import { Button } from '../../src/components/Button';
import { PriceTag } from '../../src/components/PriceTag';
import { Text } from '../../src/components/Typography';
import { formatXaf } from '../../src/lib/format';
import { colors, space, TITLE_FONT } from '../../src/theme';
import { dialog } from '../../src/components/Dialog';

/**
 * Panier : liste d'achats regroupée par vendeur, chacun dans un cadre (même direction artistique que le site).
 * Aucun paiement dans l'application : on écrit à chaque vendeur, avec un message qui reprend tous ses articles.
 */
export default function CartScreen() {
  const { status } = useAuth();
  const cart = useCart();
  const toggle = useToggleCart();

  if (status !== 'signedIn') {
    return (
      <View style={styles.padded}>
        <EmptyCard icon="cart-outline" decor={['cart-outline', 'bag-handle-outline', 'pricetag-outline', 'cube-outline', 'storefront-outline', 'gift-outline', 'card-outline']} text="Connectez-vous, puis ajoutez des articles au panier pour les retrouver ici et contacter les vendeurs." action="Se connecter" onAction={() => router.push('/login')} />
      </View>
    );
  }
  if (cart.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  if (cart.isError) {
    return (
      <View style={styles.padded}>
        <EmptyCard icon="cloud-offline-outline" text="Impossible de charger votre panier." action="Réessayer" onAction={() => void cart.refetch()} />
      </View>
    );
  }
  if (!cart.data.count) {
    return (
      <View style={styles.padded}>
        <EmptyCard icon="cart-outline" decor={['cart-outline', 'bag-handle-outline', 'pricetag-outline', 'cube-outline', 'storefront-outline', 'gift-outline', 'card-outline']} text="Votre panier est vide. Touchez « Ajouter au panier » sur une annonce pour la retrouver ici." action="Voir les annonces" onAction={() => router.push('/')} />
      </View>
    );
  }

  const remove = (id: string) =>
    toggle.mutate({ id, on: false }, { onError: (e) => dialog('Panier', e instanceof ApiError ? e.message : 'Action impossible.') });

  // Un message qui liste tous les articles encore disponibles de ce vendeur
  const write = (g: CartSeller) => {
    const items = g.items.filter((i) => i.available);
    if (!items.length) return;
    const list = items.map((i) => `« ${i.title} »`).join(', ');
    const message =
      items.length === 1
        ? `Bonjour, votre annonce ${list} est-elle toujours disponible ?`
        : `Bonjour, je suis intéressé(e) par vos annonces ${list}. Sont-elles toujours disponibles ?`;
    router.push({ pathname: '/conversation/new', params: { listingId: items[0].id, title: items[0].title, message } });
  };

  const count = cart.data.count;
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={cart.isRefetching} onRefresh={() => void cart.refetch()} tintColor={colors.primary} />}
      style={{ backgroundColor: colors.bg }}
    >
      <CountBadge label={`${count} article${count > 1 ? 's' : ''}`} />

      {cart.data.sellers.map((g) => (
        <View key={g.seller.id} style={styles.group}>
          <Pressable onPress={() => router.push(`/seller/${g.seller.id}`)} style={styles.band} accessibilityRole="button">
            <Avatar name={g.seller.displayName} size={42} />
            <View style={{ flex: 1 }}>
              <Text style={styles.seller} numberOfLines={1}>{g.seller.displayName}</Text>
              <Text style={styles.sellerHint}>{g.items.length} article{g.items.length > 1 ? 's' : ''} de ce vendeur</Text>
            </View>
            {g.seller.verificationLevel === 'identity' ? (
              <View style={styles.chip}>
                <Ionicons name="shield-checkmark" size={13} color={colors.primary} />
                <Text style={styles.chipText}>Vérifié</Text>
              </View>
            ) : null}
          </Pressable>

          {g.items.map((i, n) => (
            <View key={i.id} style={[styles.item, n > 0 && styles.itemSep, !i.available && { opacity: 0.55 }]}>
              <Pressable onPress={() => router.push(`/listing/${i.id}`)} style={styles.itemMain} accessibilityRole="button" accessibilityLabel={i.title}>
                {i.thumbnailUrl ? (
                  <Image source={i.thumbnailUrl} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="image-outline" size={22} color={colors.inkMuted} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.title} numberOfLines={1}>{i.title}</Text>
                  {i.available ? <PriceTag priceType={i.priceType} priceXaf={i.priceXaf} unit={i.priceUnit} size="sm" /> : <Text style={styles.off}>Plus disponible</Text>}
                  <View style={styles.meta}>
                    <Ionicons name="location-outline" size={13} color={colors.inkMuted} />
                    <Text style={styles.metaText} numberOfLines={1}>{i.city}</Text>
                  </View>
                </View>
              </Pressable>
              <Pressable onPress={() => remove(i.id)} hitSlop={8} style={styles.trash} accessibilityRole="button" accessibilityLabel={`Retirer ${i.title} du panier`}>
                <Ionicons name="trash-outline" size={19} color={colors.danger} />
              </Pressable>
            </View>
          ))}

          <View style={styles.foot}>
            {g.total ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.total}>{formatXaf(g.total)}</Text>
              </View>
            ) : null}
            {g.items.some((i) => i.available) ? <Button label="Écrire au vendeur" onPress={() => write(g)} /> : null}
          </View>
        </View>
      ))}

      {cart.data.sellers.length > 1 && cart.data.total ? (
        <View style={styles.grand}>
          <Text style={styles.grandLabel}>Total du panier</Text>
          <Text style={styles.grandValue}>{formatXaf(cart.data.total)}</Text>
        </View>
      ) : null}

      <SafetyNote title="Aucun paiement dans l’application" text="Écrivez à chaque vendeur et payez à la remise de l’article, après l’avoir vérifié." />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  padded: { flex: 1, padding: space.lg, backgroundColor: colors.bg },
  container: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  group: { borderRadius: 20, backgroundColor: colors.bg, padding: 10, ...cardShadow },
  band: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 10, borderRadius: 14, backgroundColor: colors.tint },
  seller: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sellerHint: { fontSize: 12, color: colors.inkMuted },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: '#DCE8FD' },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 6, paddingVertical: space.md },
  itemSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: colors.tint },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontFamily: TITLE_FONT, color: colors.ink },
  off: { fontSize: 13, fontWeight: '700', color: colors.inkMuted },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: colors.inkMuted, flexShrink: 1 },
  trash: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF1F0', alignItems: 'center', justifyContent: 'center' },
  foot: { gap: space.md, paddingHorizontal: 6, paddingTop: space.md, paddingBottom: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14, color: colors.inkMuted },
  total: { fontSize: 18, fontWeight: '800', color: colors.ink },
  grand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg, borderRadius: 18, backgroundColor: colors.navy },
  grandLabel: { fontSize: 15, color: '#fff' },
  grandValue: { fontSize: 20, fontWeight: '800', color: '#fff' },
});
