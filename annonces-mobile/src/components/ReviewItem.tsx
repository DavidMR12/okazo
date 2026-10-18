import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ApiError } from '../api/client';
import { useReportReview } from '../api/hooks';
import type { Review } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { relativeTime, reviewRoleLabel } from '../lib/format';
import { colors, space, type } from '../theme';
import { Stars } from './Stars';
import { Text } from './Typography';

/** Un avis : note, auteur (« Acheteur » ou « Vendeur »), annonce concernée, commentaire, et « Signaler ». */
export function ReviewItem({ review }: { review: Review }) {
  const { status } = useAuth();
  const report = useReportReview();

  const onReport = () => {
    if (status !== 'signedIn') return router.push('/login');
    const send = (reason: 'fake_review' | 'harassment') =>
      report.mutate(
        { id: review.id, reason },
        {
          onSuccess: () => Alert.alert('Merci', 'L’avis sera examiné par la modération.'),
          onError: (e) => Alert.alert('Signalement', e instanceof ApiError ? e.message : 'Envoi impossible.'),
        },
      );
    Alert.alert('Signaler cet avis', undefined, [
      { text: 'Faux avis (pas d’échange réel)', onPress: () => send('fake_review') },
      { text: 'Insultant ou injurieux', onPress: () => send('harassment') },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.item}>
      <View style={styles.head}>
        <Stars value={review.rating} size={15} />
        <Text style={type.small}>{relativeTime(review.createdAt)}</Text>
      </View>
      <Text style={type.small}>
        {review.authorName ?? 'Utilisateur'} · {reviewRoleLabel(review.authorRole, review.listingParentSlug)}
        {review.listingTitle ? ` · ${review.listingTitle}` : ''}
      </Text>
      {review.comment ? <Text style={type.body}>{review.comment}</Text> : null}
      <Pressable onPress={onReport} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
        <Text style={styles.report}>Signaler</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { gap: 4, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  report: { fontSize: 13, color: colors.inkMuted, textDecorationLine: 'underline' },
});
