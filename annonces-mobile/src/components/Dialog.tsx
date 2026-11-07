import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors, DIALOG_FONT, space } from '../theme';
import { Text } from './Typography';

/**
 * Boîte de dialogue d'Okazo, à la place de la boîte native (Alert.alert) dont la police et la langue des boutons
 * dépendent du téléphone (demande du porteur, 20 octobre 2026 : la police doit être celle de l'application).
 * Même appel que Alert.alert : dialog(titre, message?, boutons?). Sans bouton : un seul « OK ».
 */
export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}
interface DialogState {
  title: string;
  message?: string;
  buttons: DialogButton[];
}

let show: ((d: DialogState) => void) | null = null;
const pending: DialogState[] = [];

export function dialog(title: string, message?: string, buttons?: DialogButton[]) {
  const d = { title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] };
  if (show) show(d);
  else pending.push(d); // affiché dès que l'hôte est monté
}

/** À placer une fois, à la racine de l'application (app/_layout.tsx). */
export function DialogHost() {
  const [queue, setQueue] = useState<DialogState[]>([]);
  useEffect(() => {
    show = (d) => setQueue((q) => [...q, d]);
    if (pending.length) setQueue((q) => [...q, ...pending.splice(0)]);
    return () => {
      show = null;
    };
  }, []);
  const current = queue[0];
  const close = (b?: DialogButton) => {
    setQueue((q) => q.slice(1));
    // Action lancée une fois la fenêtre refermée : ouvrir l'appareil photo pendant la fermeture échoue sur iPhone
    if (b?.onPress) setTimeout(b.onPress, 280);
  };
  if (!current) return null;
  const cancel = current.buttons.find((b) => b.style === 'cancel');
  const danger = current.buttons.some((b) => b.style === 'destructive');
  // Boutons côte à côte s'ils sont deux et courts, sinon les uns sous les autres ; l'action principale à droite / en haut
  const side = current.buttons.length === 2 && current.buttons.every((b) => b.text.length <= 14);
  const ordered = side ? current.buttons : [...current.buttons.filter((b) => b.style !== 'cancel'), ...current.buttons.filter((b) => b.style === 'cancel')];

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => close(cancel)} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={cancel ? () => close(cancel) : undefined} accessibilityLabel="Fermer">
        <Pressable style={styles.card} accessibilityRole="alert">
          <View style={[styles.icon, danger && styles.iconDanger]}>
            <Ionicons name={danger ? 'alert-circle-outline' : 'information-circle-outline'} size={28} color={danger ? colors.danger : colors.primary} />
          </View>
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={[styles.buttons, side && styles.buttonsRow]}>
            {ordered.map((b) => {
              const kind = b.style === 'cancel' ? styles.btnCancel : b.style === 'destructive' ? styles.btnDanger : styles.btnPrimary;
              const textKind = b.style === 'cancel' ? styles.btnTextCancel : styles.btnTextFilled;
              return (
                <Pressable key={b.text} onPress={() => close(b)} style={({ pressed }) => [styles.btn, side && { flex: 1 }, kind, pressed && { opacity: 0.85 }]} accessibilityRole="button">
                  <Text style={[styles.btnText, textKind]} numberOfLines={2}>{b.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.bg, borderRadius: 26, padding: space.xl, alignItems: 'center', gap: space.sm },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  iconDanger: { backgroundColor: '#FFF1F0' },
  title: { fontSize: 18, lineHeight: 24, fontFamily: DIALOG_FONT, color: colors.ink, textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 22, color: colors.inkMuted, textAlign: 'center' },
  buttons: { alignSelf: 'stretch', gap: space.sm, marginTop: space.md },
  buttonsRow: { flexDirection: 'row' },
  btn: { minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  btnPrimary: { backgroundColor: colors.primary },
  btnDanger: { backgroundColor: colors.danger },
  btnCancel: { backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.tintLine },
  btnText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  btnTextFilled: { color: '#fff' },
  btnTextCancel: { color: colors.ink },
});
