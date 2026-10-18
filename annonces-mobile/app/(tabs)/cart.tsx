import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ApiError } from '../../src/api/client';
import { useCart, useToggleCart } from '../../src/api/hooks';
import type { CartSeller } from '../../src/api/types';
import { useAuth } from '../../src/auth/AuthProvider';
import { Button } from '../../src/components/Button';
import { Message } from '../../src/components/Message';
import { PriceTag } from '../../src/components/PriceTag';
import { Text } from '../../src/components/Typography';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';
import { formatXaf } from '../../src/lib/format';
import { colors, space, type } from '../../src/theme';

/**
 * Panier : liste d'achats regroupée par vendeur. Aucun paiement dans l'application :
 * on écrit à chaque vendeur, avec un message qui reprend tous ses articles, et on conclut avec lui.
 */
export default function CartScreen() {
  const { status } = useAuth();
  const cart = useCart();
  const toggle = useToggleCart();

  if (status !== 'signedIn') {
    return (
      <Message
        title="Votre panier"
        body="Connectez-vous, puis ajoutez des articles au panier pour les retrouver ici et contacter les vendeurs."
        actionLabel="Se connecter"
        onAction={() => router.push('/login')}
      />
    );
  }
  if (cart.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  if (cart.isError) return <Message title="Impossible de charger votre panier" actionLabel="Réessayer" onAction={() => void cart.refetch()} />;
  if (!cart.data.count) {
    return <Message title="Votre panier est vide" body="Touchez « Ajouter au panier » sur une annonce pour la retrouver ici." actionLabel="Voir les annonces" onAction={() => router.push('/')} />;
  }

  const remove = (id: string) =>
    toggle.mutate({ id, on: false }, { onError: (e) => Alert.alert('Panier', e instanceof ApiError ? e.message : 'Action impossible.') });

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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={cart.isRefetching} onRefresh={() => void cart.refetch()} tintColor={colors.primary} />}
      style={{ backgroundColor: colors.bg }}
    >
      <Text style={type.small}>
        Aucun paiement dans l’application : écrivez à chaque vendeur et payez à la remise de l’article, après l’avoir vérifié.
      </Text>

      {cart.data.sellers.map((g) => (
        <View key={g.seller.id} style={styles.group}>
          <Pressable onPress={() => router.push(`/seller/${g.seller.id}`)} style={styles.sellerRow} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={type.heading}>{g.seller.displayName}</Text>
              {g.seller.verificationLevel === 'identity' ? <VerifiedBadge /> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
          </Pressable>

          {g.items.map((i) => (
            <View key={i.id} style={[styles.item, !i.available && { opacity: 0.5 }]}>
              <Pressable onPress={() => router.push(`/listing/${i.id}`)} style={styles.itemMain} accessibilityRole="button" accessibilityLabel={i.title}>
                {i.thumbnailUrl ? (
                  <Image source={i.thumbnailUrl} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="image-outline" size={22} color={colors.inkMuted} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.title} numberOfLines={2}>{i.title}</Text>
                  {i.available ? <PriceTag priceType={i.priceType} priceXaf={i.priceXaf} unit={i.priceUnit} /> : <Text style={type.small}>Plus disponible</Text>}
                </View>
              </Pressable>
              <Pressable onPress={() => remove(i.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Retirer ${i.title} du panier`}>
                <Ionicons name="trash-outline" size={20} color={colors.inkMuted} />
              </Pressable>
            </View>
          ))}

          {g.total ? <Text style={styles.total}>Total : {formatXaf(g.total)}</Text> : null}
          {g.items.some((i) => i.available) ? <Button label="Écrire au vendeur" variant="secondary" onPress={() => write(g)} /> : null}
        </View>
      ))}

      {cart.data.sellers.length > 1 && cart.data.total ? (
        <Text style={[styles.total, styles.grandTotal]}>Total du panier : {formatXaf(cart.data.total)}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  group: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, borderRadius: 12, padding: space.md, gap: space.md },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.surface },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3E7EF' },
  title: { fontSize: 15, lineHeight: 20, color: colors.ink },
  total: { fontSize: 15, color: colors.ink, textAlign: 'right' },
  grandTotal: { fontSize: 17 },
});
