import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors, space, type } from '../theme';
import { Flag } from './Flag';
import { Text } from './Typography';

export interface DialCountry { code: string; name: string; dialCode: string }

/**
 * Indicatif du numéro : drapeau et indicatif (+237), placés à gauche du champ numéro.
 * Un appui ouvre la liste des pays avec leur drapeau, leur nom et leur indicatif.
 */
export function DialCodePicker({ countries, value, onChange }: { countries: DialCountry[]; value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = countries.find((c) => c.code === value) ?? countries[0];
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.current} accessibilityRole="button" accessibilityLabel={`Indicatif : ${current?.name} ${current?.dialCode}`}>
        <Flag code={current?.code ?? ''} />
        <Text style={styles.dial}>{current?.dialCode}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.inkMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Fermer">
          <View style={styles.sheet}>
            <Text style={[type.heading, { marginBottom: space.sm }]}>Indicatif du pays</Text>
            <FlatList
              data={countries}
              keyExtractor={(c) => c.code}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item.code);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.row, item.code === current?.code && styles.rowOn, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.code === current?.code }}
                >
                  <Flag code={item.code} width={28} />
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.rowDial}>{item.dialCode}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  current: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: space.sm, borderRightWidth: 1.5, borderRightColor: colors.line, height: 34 },
  dial: { fontSize: 17, fontWeight: '700', color: colors.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,27,45,0.45)', justifyContent: 'center', padding: space.xl },
  sheet: { backgroundColor: colors.bg, borderRadius: 16, padding: space.lg, maxHeight: '70%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingHorizontal: space.sm, borderRadius: 10 },
  rowOn: { backgroundColor: colors.tint },
  name: { flex: 1, fontSize: 16, color: colors.ink },
  rowDial: { fontSize: 16, fontWeight: '700', color: colors.inkMuted },
});
