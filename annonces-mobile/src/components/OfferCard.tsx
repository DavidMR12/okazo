import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import type { ChatMessage, OfferStatus } from '../api/types';
import { formatXaf } from '../lib/format';
import { colors, space } from '../theme';
import { Button } from './Button';
import { Text } from './Typography';

const STATUS: Record<OfferStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { label: 'En attente de réponse', color: colors.primary, icon: 'time-outline' },
  accepted: { label: 'Offre acceptée', color: colors.trust, icon: 'checkmark-circle' },
  declined: { label: 'Offre refusée', color: colors.danger, icon: 'close-circle-outline' },
  withdrawn: { label: 'Offre retirée', color: colors.inkMuted, icon: 'arrow-undo-outline' },
  expired: { label: 'Offre expirée (48 h sans réponse)', color: colors.inkMuted, icon: 'hourglass-outline' },
};

/**
 * Carte d'une offre de prix dans la conversation. Le vendeur accepte ou refuse une offre en attente,
 * l'acheteur peut la retirer. Les étapes suivantes (acceptée, refusée…) s'affichent en ligne discrète.
 */
export function OfferCard({
  message,
  mine,
  isSeller,
  busy,
  onAction,
}: {
  message: ChatMessage;
  mine: boolean;
  isSeller: boolean;
  busy: boolean;
  onAction: (offerId: string, action: 'accept' | 'decline' | 'withdraw') => void;
}) {
  const o = message.offer;
  if (!o) return <Text style={styles.system}>{message.body}</Text>;
  const s = STATUS[o.status];
  return (
    <View style={[styles.card, mine ? styles.right : styles.left]}>
      <Text style={styles.caption}>{mine ? 'Votre offre' : 'Offre reçue'}</Text>
      <Text style={styles.amount}>{formatXaf(o.amountXaf)}</Text>
      <View style={styles.status}>
        <Ionicons name={s.icon} size={16} color={s.color} />
        <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
      </View>
      {o.status === 'pending' && isSeller ? (
        <View style={styles.actions}>
          <Button label="Accepter" onPress={() => onAction(o.id, 'accept')} loading={busy} style={{ flex: 1 }} />
          <Button label="Refuser" variant="secondary" onPress={() => onAction(o.id, 'decline')} style={{ flex: 1 }} />
        </View>
      ) : null}
      {o.status === 'pending' && mine ? <Button label="Retirer mon offre" variant="secondary" onPress={() => onAction(o.id, 'withdraw')} /> : null}
      {o.status === 'accepted' ? <Text style={styles.hint}>Convenez d’un rendez-vous ici. Payez seulement à la rencontre, après avoir vu l’article.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '82%', gap: space.xs, padding: space.lg, borderRadius: 16, borderWidth: 1.5, borderColor: colors.tintLine, backgroundColor: colors.tint },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  caption: { fontSize: 13, color: colors.inkMuted },
  amount: { fontSize: 24, color: colors.ink },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 14 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  hint: { fontSize: 13, lineHeight: 18, color: colors.inkMuted, marginTop: space.xs },
  system: { alignSelf: 'center', fontSize: 13, color: colors.inkMuted, textAlign: 'center', paddingVertical: space.xs },
});
