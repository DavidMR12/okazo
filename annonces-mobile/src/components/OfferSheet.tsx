import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import { formatXaf } from '../lib/format';
import { colors, space, type } from '../theme';
import { Button } from './Button';
import { Chip } from './Chip';
import { Text, TextInput } from './Typography';

const MIN_RATIO = 0.3; // même règle que l'API : au moins 30 % du prix affiché
const groupDigits = (d: string) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * « Faire une offre » : montant (avec propositions à -5 %, -10 %, -15 %) et message facultatif.
 * Ouvre ou complète la conversation avec le vendeur ; onSent reçoit son identifiant.
 */
export function OfferSheet({
  visible,
  listingId,
  price,
  onClose,
  onSent,
}: {
  visible: boolean;
  listingId: string;
  price: number | null; // null : prix « sur demande »
  onClose: () => void;
  onSent: (conversationId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount('');
      setMessage('');
      setError(null);
    }
  }, [visible]);

  const suggestions = price ? [5, 10, 15].map((p) => ({ label: `-${p} %`, value: Math.round((price * (100 - p)) / 100 / 500) * 500 })) : [];

  const send = async () => {
    const n = Number(amount);
    if (!n) return setError('Indiquez un montant.');
    if (price && n >= price) return setError(`Proposez un montant inférieur au prix affiché (${formatXaf(price)}).`);
    if (price && n < Math.ceil(price * MIN_RATIO)) return setError(`Offre trop basse : proposez au moins ${formatXaf(Math.ceil(price * MIN_RATIO))}.`);
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ conversationId: string }>(`/listings/${listingId}/offers`, { method: 'POST', auth: true, body: { amountXaf: n, message: message.trim() || undefined } });
      onSent(r.conversationId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Envoi impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={[styles.sheet, { paddingBottom: space.lg + insets.bottom }]}>
          <View style={styles.head}>
            <Text style={type.title}>Faire une offre</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer">
              <Ionicons name="close" size={26} color={colors.ink} />
            </Pressable>
          </View>
          {price ? <Text style={type.small}>Prix affiché : {formatXaf(price)}. Le vendeur a 48 h pour répondre.</Text> : <Text style={type.small}>Prix sur demande. Le vendeur a 48 h pour répondre.</Text>}

          {suggestions.length ? (
            <View style={styles.wrap}>
              {suggestions.map((s) => (
                <Chip key={s.label} label={`${formatXaf(s.value)} (${s.label})`} selected={Number(amount) === s.value} onPress={() => setAmount(String(s.value))} />
              ))}
            </View>
          ) : null}

          <View style={styles.amountRow}>
            <TextInput
              value={groupDigits(amount)}
              onChangeText={(v) => setAmount(v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11))}
              keyboardType="number-pad"
              placeholder="Votre prix"
              placeholderTextColor={colors.inkMuted}
              style={styles.amount}
              accessibilityLabel="Montant de l’offre en francs CFA"
            />
            <Text style={styles.currency}>FCFA</Text>
          </View>

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Un mot pour le vendeur (facultatif)"
            placeholderTextColor={colors.inkMuted}
            maxLength={1000}
            style={styles.input}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Envoyer mon offre" onPress={() => void send()} loading={busy} />
          <Text style={[type.small, { textAlign: 'center' }]}>Aucun paiement dans l’application : vous réglez à la rencontre, après avoir vu l’article.</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amount: { flex: 1, minWidth: 0, borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, paddingHorizontal: space.md, height: 54, fontSize: 22, color: colors.ink },
  currency: { fontSize: 18, color: colors.inkMuted },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, paddingHorizontal: space.md, minHeight: 48, fontSize: 16, color: colors.ink },
  error: { color: colors.danger, fontSize: 14 },
});
