import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../src/components/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../../src/api/client';
import { useCartIds, useContactSeller, useFavoriteIds, useListing, useMe, useMyApplications, useToggleCart, useToggleFavorite } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/AuthProvider';
import { PendingKind, setPendingAction, takePendingAction } from '../../src/lib/pendingAction';
import { Button } from '../../src/components/Button';
import { Message } from '../../src/components/Message';
import { PriceTag } from '../../src/components/PriceTag';
import { SafetyNotice } from '../../src/components/SafetyNotice';
import { OfferSheet } from '../../src/components/OfferSheet';
import { SimilarListings } from '../../src/components/SimilarListings';
import { useNetwork } from '../../src/lib/network';
import { RatingSummary } from '../../src/components/Stars';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';
import { CONDITION_LABELS, memberSince, placeLabel, priceLabel, relativeTime } from '../../src/lib/format';
import { colors, PRICE_FONT, space, TITLE_FONT, type } from '../../src/theme';
import { WalletList } from '../../src/components/Wallets';
import { DetailCard, FactGrid } from '../../src/components/DetailCard';
import { categoryIcon } from '../../src/lib/categoryIcons';

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const listing = useListing(id);
  const favoriteIds = useFavoriteIds();
  const toggle = useToggleFavorite();
  const cartIds = useCartIds();
  const toggleCart = useToggleCart();
  const me = useMe();
  // Offre d'emploi : « Postuler » remplace « Écrire au vendeur » (la candidature ouvre aussi la conversation)
  const jobOffer = listing.data?.category.parentSlug === 'emploi' && listing.data.adType === 'offer';
  const myApplication = useMyApplications(id, jobOffer);
  const contact = useContactSeller();
  const [page, setPage] = useState(0);
  const [offerOpen, setOfferOpen] = useState(false);
  const net = useNetwork();
  const [hq, setHq] = useState(false); // photos en grand malgré le mode léger
  const [contactOpen, setContactOpen] = useState(false); // choix du moyen de contact (« Contacter »)

  // Reprise de l’action interrompue par la connexion (voir src/lib/pendingAction.ts)
  const reachRef = useRef<((how: 'whatsapp' | 'call') => void) | null>(null);
  useEffect(() => {
    const data = listing.data;
    if (status !== 'signedIn' || !data) return;
    const a = takePendingAction('listing', data.id);
    if (!a) return;
    // Petit délai : laisse se fermer l’écran de connexion avant d’ouvrir autre chose
    const t = setTimeout(() => {
      if (a.kind === 'write') router.push({ pathname: '/conversation/new', params: { listingId: data.id, title: data.title } });
      else if (a.kind === 'apply') router.push({ pathname: '/apply/[id]', params: { id: data.id, title: data.title } });
      else if (a.kind === 'favorite') toggle.mutate({ id: data.id, on: true });
      else if (a.kind === 'cart') toggleCart.mutate({ id: data.id, on: true });
      else if (a.kind === 'offer') setOfferOpen(true);
      else if (a.kind === 'report') router.push({ pathname: '/report', params: { listingId: data.id } });
      else reachRef.current?.(a.kind);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, listing.data?.id]);

  if (listing.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  if (listing.isError || !listing.data) {
    const gone = listing.error instanceof ApiError && listing.error.status === 404;
    return (
      <Message
        title={gone ? "Cette annonce n’est plus disponible" : "Impossible d’ouvrir l’annonce"}
        body={gone ? 'Elle a été vendue, retirée ou a expiré.' : listing.error instanceof ApiError ? listing.error.message : undefined}
        actionLabel={gone ? "Retour à l’accueil" : 'Réessayer'}
        onAction={() => (gone ? router.back() : void listing.refetch())}
      />
    );
  }

  const l = listing.data;
  const favorited = favoriteIds.has(l.id);
  const sold = l.status === 'sold';
  const inCart = cartIds.has(l.id);
  // Panier : seulement pour une offre d'un autre vendeur, jamais pour une offre d'emploi (même règle que l'API)
  const purchasable = !sold && l.adType === 'offer' && l.category.parentSlug !== 'emploi' && me.data?.id !== l.seller.id;
  const onCart = () => {
    if (!requireSignIn('cart')) return;
    toggleCart.mutate(
      { id: l.id, on: !inCart },
      { onError: (e) => Alert.alert('Panier', e instanceof ApiError ? e.message : 'Action impossible.') },
    );
  };
  const imgHeight = Math.round(width * 0.75);

  const requireSignIn = (kind: PendingKind) => {
    if (status !== 'signedIn') {
      setPendingAction(kind, l.id, 'listing');
      router.push('/login');
      return false;
    }
    return true;
  };

  const write = () => {
    if (!requireSignIn('write')) return;
    router.push({ pathname: '/conversation/new', params: { listingId: l.id, title: l.title } });
  };

  const ownListing = me.data?.id === l.seller.id;
  const applied = myApplication.data?.[0];
  const applyNow = () => {
    if (!requireSignIn('apply')) return;
    router.push({ pathname: '/apply/[id]', params: { id: l.id, title: l.title } });
  };

  const reach = (how: 'whatsapp' | 'call') => {
    if (!requireSignIn(how)) return;
    contact.mutate(l.id, {
      onSuccess: async (c) => {
        const url = how === 'whatsapp' ? c.whatsappUrl : `tel:${c.phone}`;
        try {
          await Linking.openURL(url);
        } catch {
          Alert.alert(how === 'whatsapp' ? 'WhatsApp introuvable' : 'Appel impossible', `Numéro du vendeur : ${c.phone}`);
        }
      },
      onError: (e) => Alert.alert('Contact', e instanceof ApiError ? e.message : 'Action impossible.'),
    });
  };
  reachRef.current = reach;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* En-tête de la maquette du porteur (18 octobre 2026) : retour, logo et signature, raccourcis */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Image source={require('../../src/assets/okazo-logo.png')} style={styles.logo} contentFit="contain" accessibilityLabel="Okazo" />
          <Text style={styles.tagline} numberOfLines={1}>Achetez · Vendez · Près de chez vous</Text>
        </View>
        <HeaderIcon name="heart" label="Mes favoris" onPress={() => router.push('/favorites')} />
        <HeaderIcon name="chatbubble-ellipses" label="Messages" onPress={() => router.push('/(tabs)/messages')} />
        <HeaderIcon name="cart" label="Panier" onPress={() => router.push('/(tabs)/cart')} />
        <HeaderIcon name="person" label="Profil" onPress={() => router.push('/(tabs)/account')} />
        <Pressable onPress={() => router.push('/(tabs)/publish')} style={styles.headerPlus} accessibilityRole="button" accessibilityLabel="Publier une annonce">
          <Ionicons name="add" size={24} color="#fff" />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <View>
          <FlatList
            data={l.images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(img) => img.url}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <Image
                source={net.light && !hq ? item.thumbUrl : item.url}
                placeholder={item.thumbUrl} // la miniature (déjà en cache) s’affiche pendant le chargement
                style={{ width, height: imgHeight, backgroundColor: colors.surface }}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={150}
              />
            )}
          />
          {net.light && !hq && l.images.length ? (
            <Pressable onPress={() => setHq(true)} style={styles.hqBtn} accessibilityRole="button">
              <Ionicons name="image-outline" size={14} color="#fff" />
              <Text style={styles.hqText}>Photos en haute qualité</Text>
            </Pressable>
          ) : null}
          <Pressable
            hitSlop={8}
            onPress={() => requireSignIn('favorite') && toggle.mutate({ id: l.id, on: !favorited })}
            style={styles.favBtn}
            accessibilityRole="button"
            accessibilityLabel={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={22} color={favorited ? colors.danger : colors.ink} />
          </Pressable>
          {l.images.length > 1 ? (
            <View style={styles.counter}>
              <Text style={styles.counterText}>{page + 1}/{l.images.length}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          {sold ? <Text style={styles.sold}>Vendu</Text> : null}
          {l.adType === 'request' ? <Text style={styles.requestBadge}>Je recherche</Text> : null}
          <Text style={[type.title, { fontFamily: TITLE_FONT }]}>{l.title}</Text>
          {l.priceLabel !== 'Prix' ? <Text style={type.small}>{l.priceLabel}</Text> : null}
          <PriceTag priceType={l.priceType} priceXaf={l.priceXaf} unit={l.priceUnit} size="lg" />
          <Text style={type.small}>
            {placeLabel(l.city, l.district)}, {relativeTime(l.publishedAt)}
          </Text>
          {l.handDelivery ? (
            <View style={styles.handover}>
              <Ionicons name="hand-right" size={16} color={colors.primary} />
              <Text style={styles.handoverText}>Remise en main propre</Text>
            </View>
          ) : null}
          {l.paymentMethods?.length ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              <Text style={type.small}>Paiement électronique accepté</Text>
              <WalletList codes={l.paymentMethods} />
            </View>
          ) : null}
        </View>

        {purchasable ? (
          <View style={[styles.section, { flexDirection: 'row', gap: space.sm }]}>
            <Button
              label={inCart ? 'Dans le panier' : 'Panier'}
              icon={inCart ? 'cart' : 'cart-outline'}
              variant="secondary"
              onPress={onCart}
              style={{ flex: 1 }}
            />
            {l.priceType !== 'free' ? (
              <Button label="Faire une offre" icon="pricetag-outline" variant="secondary" onPress={() => requireSignIn('offer') && setOfferOpen(true)} style={{ flex: 1 }} />
            ) : null}
          </View>
        ) : null}
        <OfferSheet
          visible={offerOpen}
          listingId={l.id}
          price={l.priceType === 'fixed' || l.priceType === 'negotiable' ? l.priceXaf : null}
          onClose={() => setOfferOpen(false)}
          onSent={(conversationId) => {
            setOfferOpen(false);
            router.push(`/conversation/${conversationId}`);
          }}
        />

        {/* Caractéristiques et description : cadres de la maquette du porteur (bandeau, pastille, icônes) */}
        <DetailCard icon="list" title="Caractéristiques" chip={l.category.name} chipIcon={categoryIcon(l.category.parentSlug ?? '')}>
          <FactGrid
            facts={[
              { key: 'category', label: 'Catégorie', value: l.category.name },
              ...(l.condition ? [{ key: 'condition', label: 'État', value: CONDITION_LABELS[l.condition] ?? l.condition }] : []),
              ...l.facts,
            ]}
          />
        </DetailCard>

        <DetailCard icon="pencil" title="Description">
          <Text style={styles.description} selectable>{l.description}</Text>
        </DetailCard>

        <Pressable style={[styles.section, styles.seller]} onPress={() => router.push(`/seller/${l.seller.id}`)} accessibilityRole="button">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{l.seller.displayName.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.heading}>{l.seller.displayName}</Text>
            {l.seller.verificationLevel === 'identity' ? <VerifiedBadge /> : null}
            <RatingSummary avg={l.seller.ratingAvg} count={l.seller.ratingCount} />
            <Text style={type.small}>{memberSince(l.seller.memberSince)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
        </Pressable>

        <View style={styles.section}>
          <SafetyNotice parentSlug={l.category.parentSlug} />
        </View>

        <Pressable
          style={styles.reportLink}
          onPress={() => requireSignIn('report') && router.push({ pathname: '/report', params: { listingId: l.id } })}
          accessibilityRole="button"
        >
          <Ionicons name="flag-outline" size={16} color={colors.inkMuted} />
          <Text style={styles.reportText}>Signaler cette annonce</Text>
        </Pressable>

        <SimilarListings
          listingId={l.id}
          categoryId={l.category.id}
          country={l.countryCode}
          favoriteIds={favoriteIds}
          onToggleFavorite={(id, on) => requireSignIn('favorite') && toggle.mutate({ id, on })}
        />
      </ScrollView>

      {!sold ? (
        <View style={[styles.bar, { paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.barTag}>
            <Ionicons name="pricetag" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.barPrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {priceLabel(l.priceType, l.priceXaf)}{(l.priceType === 'fixed' || l.priceType === 'negotiable') && l.priceUnit ? ` / ${l.priceUnit}` : ''}
            </Text>
            {l.priceType === 'negotiable' ? (
              <View style={styles.barNoteRow}>
                <Ionicons name="trending-down" size={15} color={colors.inkMuted} />
                <Text style={styles.barNote}>À débattre</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.barSep} />
          {jobOffer && ownListing ? (
            <Button label="Candidatures" onPress={() => router.push(`/listing/applications/${l.id}`)} style={{ flex: 1.15 }} />
          ) : jobOffer && applied ? (
            <Button label="Envoyée" icon="checkmark-circle-outline" variant="secondary" onPress={() => router.push('/applications')} style={{ flex: 1.15 }} />
          ) : jobOffer ? (
            <Button label="Postuler" icon="send-outline" onPress={applyNow} style={{ flex: 1.15 }} />
          ) : (
            <Button label="Contacter" icon="chatbubble-ellipses-outline" onPress={() => (l.seller.contactPreference === 'messages_only' ? write() : setContactOpen(true))} style={{ flex: 1.15 }} />
          )}
        </View>
      ) : null}

      {/* « Contacter » : écrire, WhatsApp ou appeler (le numéro n'est jamais donné si le vendeur préfère la messagerie) */}
      <Modal visible={contactOpen} transparent animationType="fade" onRequestClose={() => setContactOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setContactOpen(false)} accessibilityLabel="Fermer">
          <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
            <Text style={type.heading}>Contacter {l.seller.displayName}</Text>
            <Button label="Écrire au vendeur" icon="chatbubble-ellipses-outline" onPress={() => { setContactOpen(false); write(); }} />
            <Button label="WhatsApp" icon="logo-whatsapp" variant="whatsapp" loading={contact.isPending} onPress={() => { setContactOpen(false); reach('whatsapp'); }} />
            <Button label="Appeler" icon="call-outline" variant="secondary" loading={contact.isPending} onPress={() => { setContactOpen(false); reach('call'); }} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function HeaderIcon({ name, label, onPress }: { name: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={name} size={17} color={colors.primary} />
    </Pressable>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
      <Text style={type.small}>{label}</Text>
      <Text style={[type.body, { fontWeight: '600', flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingBottom: 10, backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  logo: { height: 24, width: 84 },
  tagline: { fontSize: 7.5, letterSpacing: -0.15, color: colors.inkMuted, marginTop: 1 },
  headerIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E6EDF8', shadowColor: '#1E3A8A', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  headerPlus: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  favBtn: { position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' },
  description: { fontSize: 16, lineHeight: 24, color: colors.ink, fontWeight: '400' },
  barTag: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  barPrice: { fontSize: 20, fontFamily: PRICE_FONT, color: colors.ink },
  barNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  barNote: { fontSize: 14, color: colors.inkMuted, fontWeight: '400' },
  barSep: { width: 1, height: 40, backgroundColor: colors.line },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(20,27,45,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  handover: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  handoverText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  hqBtn: { position: 'absolute', left: space.md, bottom: space.md, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(20,27,45,0.72)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  hqText: { color: '#fff', fontSize: 12 },
  requestBadge: { alignSelf: 'flex-start', backgroundColor: colors.surface, color: colors.primary, fontSize: 13, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  counter: {
    position: 'absolute',
    right: space.md,
    bottom: space.md,
    backgroundColor: 'rgba(22,32,27,0.75)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  counterText: { color: colors.bg, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  section: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm },
  facts: { gap: space.xs },
  box: { marginHorizontal: space.lg, marginTop: space.lg, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: colors.tintLine, borderRadius: 16 },
  sold: { alignSelf: 'flex-start', backgroundColor: colors.ink, color: colors.bg, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  seller: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.primary },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg },
  reportText: { fontSize: 14, color: colors.inkMuted, textDecorationLine: 'underline' },
  callBtn: { width: 48, height: 48, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
});
