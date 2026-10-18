import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Typography';
import { useSeller, useSellerReviews } from '../../src/api/hooks';
import { ReviewItem } from '../../src/components/ReviewItem';
import { RatingSummary } from '../../src/components/Stars';
import { useAuth } from '../../src/auth/AuthProvider';
import { ListingFeed } from '../../src/components/ListingFeed';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';
import { memberSince } from '../../src/lib/format';
import { colors, space, type } from '../../src/theme';

export default function SellerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const seller = useSeller(id);
  const reviews = useSellerReviews(id);
  const latest = reviews.data?.pages[0].items.slice(0, 3) ?? [];
  const { status } = useAuth();
  const filters = useMemo(() => ({ sellerId: id }), [id]);
  const s = seller.data;

  const header = s ? (
    <View style={styles.header}>
      <Text style={type.title}>{s.displayName}</Text>
      {s.verificationLevel === 'identity' ? <VerifiedBadge /> : <Text style={type.small}>Identité non vérifiée</Text>}
      <Text style={type.small}>
        {memberSince(s.memberSince)}
        {s.city ? `, ${s.city}` : ''}
      </Text>
      <RatingSummary avg={s.ratingAvg} count={s.ratingCount} />
      <Text style={type.body}>
        {s.activeListings} annonce{s.activeListings > 1 ? 's' : ''} en ligne, {s.soldListings} vendue{s.soldListings > 1 ? 's' : ''}
      </Text>
      <Pressable
        onPress={() => (status === 'signedIn' ? router.push({ pathname: '/report', params: { userId: s.id } }) : router.push('/login'))}
        accessibilityRole="button"
      >
        <Text style={styles.report}>Signaler ce vendeur</Text>
      </Pressable>
      {latest.length ? (
        <View style={styles.reviews}>
          <Text style={type.heading}>Avis reçus</Text>
          {latest.map((r) => (
            <ReviewItem key={r.id} review={r} />
          ))}
          {(s.ratingCount ?? 0) > latest.length ? (
            <Pressable onPress={() => router.push(`/reviews/${s.id}`)} accessibilityRole="button">
              <Text style={styles.more}>Voir les {s.ratingCount} avis</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={[type.heading, { marginTop: space.lg }]}>Annonces</Text>
    </View>
  ) : (
    <View style={styles.header} />
  );

  return <ListingFeed filters={filters} header={header} />;
}

const styles = StyleSheet.create({
  header: { padding: space.lg, gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  report: { marginTop: space.sm, fontSize: 14, color: colors.inkMuted, textDecorationLine: 'underline' },
  reviews: { marginTop: space.lg, padding: space.lg, gap: space.xs, borderWidth: 1, borderColor: colors.tintLine, borderRadius: 16 },
  more: { color: colors.primary, fontSize: 15, paddingTop: space.sm },
});
