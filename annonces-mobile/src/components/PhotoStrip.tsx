import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import type { Photo } from '../hooks/usePhotoUploads';
import { colors, space } from '../theme';
import { dialog } from './Dialog';

const SIZE = 96;

export function PhotoStrip({
  photos,
  remaining,
  onAdd,
  onRemove,
  onRetry,
  onMakeCover,
}: {
  photos: Photo[];
  remaining: number;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onMakeCover: (id: string) => void;
}) {
  const options = (p: Photo, index: number) => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (p.status === 'error') buttons.push({ text: "Réessayer l’envoi", onPress: () => onRetry(p.id) });
    if (index > 0) buttons.push({ text: 'Mettre en photo principale', onPress: () => onMakeCover(p.id) });
    buttons.push({ text: 'Retirer', style: 'destructive', onPress: () => onRemove(p.id) });
    buttons.push({ text: 'Annuler', style: 'cancel' });
    dialog('Photo', p.status === 'error' ? p.error : undefined, buttons);
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {photos.map((p, i) => (
        <Pressable key={p.id} onPress={() => options(p, i)} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}`}>
          <Image source={p.uri || undefined} style={styles.thumb} contentFit="cover" />
          {p.status === 'processing' || p.status === 'uploading' ? (
            <View style={styles.overlay}>
              <ActivityIndicator color={colors.bg} />
            </View>
          ) : null}
          {p.status === 'error' ? (
            <View style={[styles.overlay, { backgroundColor: 'rgba(184,50,39,0.75)' }]}>
              <Ionicons name="refresh" size={22} color={colors.bg} />
              <Text style={styles.overlayText}>Réessayer</Text>
            </View>
          ) : null}
          {p.status === 'done' ? (
            <View style={styles.check}>
              <Ionicons name="checkmark-circle" size={20} color={colors.trust} />
            </View>
          ) : null}
          {i === 0 ? <Text style={styles.cover}>Principale</Text> : null}
        </Pressable>
      ))}
      {remaining > 0 ? (
        <Pressable onPress={onAdd} style={[styles.thumb, styles.add]} accessibilityRole="button" accessibilityLabel="Ajouter des photos">
          <Ionicons name="camera-outline" size={26} color={colors.primary} />
          <Text style={styles.addText}>{photos.length ? `+ ${remaining}` : 'Ajouter'}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: space.xs },
  thumb: { width: SIZE, height: SIZE, borderRadius: 8, backgroundColor: colors.surface },
  overlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 8,
    backgroundColor: 'rgba(22,32,27,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  overlayText: { color: colors.bg, fontSize: 12, fontWeight: '700' },
  check: { position: 'absolute', top: 4, right: 4, backgroundColor: colors.bg, borderRadius: 10 },
  cover: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.bg,
    backgroundColor: 'rgba(22,32,27,0.7)',
    paddingVertical: 2,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
  },
  add: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, gap: 4 },
  addText: { fontSize: 12, fontWeight: '600', color: colors.primary },
});
