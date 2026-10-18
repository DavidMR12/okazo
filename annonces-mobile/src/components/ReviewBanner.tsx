import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useReviewStatus } from '../api/hooks';
import { colors, space, type } from '../theme';
import { Stars } from './Stars';
import { Text } from './Typography';

/**
 * Dans une conversation : invitation à donner son avis quand l'échange le permet (les deux ont écrit,
 * depuis 24 h ou annonce vendue), ou rappel de l'avis déjà donné. Rien sinon.
 */
export function ReviewBanner({ conversationId }: { conversationId: string }) {
  const q = useReviewStatus(conversationId);
  const s = q.data;
  if (!s) return null;

  if (s.mine) {
    return (
      <View style={styles.box}>
        <Text style={type.small}>Votre avis sur {s.target?.displayName ?? 'cet échange'}</Text>
        <Stars value={s.mine.rating} />
      </View>
    );
  }
  if (!s.canReview || !s.target) return null;
  return (
    <Pressable
      style={[styles.box, styles.invite]}
      onPress={() => router.push({ pathname: '/review/[id]', params: { id: conversationId, name: s.target!.displayName, role: s.role, job: s.parentSlug === 'emploi' ? '1' : '' } })}
      accessibilityRole="button"
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.body}>Comment s’est passé l’échange avec {s.target.displayName} ?</Text>
        <Text style={styles.link}>Donner mon avis</Text>
      </View>
      <Stars value={0} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginHorizontal: space.md, marginTop: space.sm, padding: space.md, borderRadius: 12, borderWidth: 1, borderColor: colors.tintLine },
  invite: { backgroundColor: colors.tint },
  link: { color: colors.primary, fontSize: 15 },
});
