import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/Typography';
import { api, ApiError } from '../src/api/client';
import { useMyVerification } from '../src/api/hooks';
import { Button } from '../src/components/Button';
import { Chip } from '../src/components/Chip';
import { Message } from '../src/components/Message';
import { compressImage, uploadVerificationPhotos } from '../src/lib/upload';
import { colors, space, type } from '../src/theme';

type DocKind = 'id_card' | 'passport' | 'driver_license';
const DOCS: { value: DocKind; label: string }[] = [
  { value: 'id_card', label: "Carte d’identité" },
  { value: 'passport', label: 'Passeport' },
  { value: 'driver_license', label: 'Permis de conduire' },
];

export default function VerifyIdentityScreen() {
  const verification = useMyVerification();
  const qc = useQueryClient();
  const [kind, setKind] = useState<DocKind>('id_card');
  const [doc, setDoc] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'doc' | 'selfie' | 'send'>(null);

  /**
   * Appareil photo uniquement, pas de galerie : une photo prise sur le moment est plus difficile à falsifier
   * qu’une image récupérée sur Internet.
   */
  const capture = async (which: 'doc' | 'selfie') => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Appareil photo', "Autorisez l’accès à l’appareil photo dans les réglages du téléphone.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      cameraType: which === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
    if (res.canceled) return;
    setBusy(which);
    try {
      const a = res.assets[0];
      // Qualité un peu plus élevée que pour les annonces : le texte de la pièce doit rester lisible
      const c = await compressImage(a.uri, a.width, a.height, 1600, 0.82);
      (which === 'doc' ? setDoc : setSelfie)(c.uri);
    } catch {
      Alert.alert('Photo', 'Impossible de traiter la photo. Réessayez.');
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!doc || !selfie) return;
    setBusy('send');
    try {
      const [documentKey, selfieKey] = await uploadVerificationPhotos(doc, selfie);
      await api('/verifications', { method: 'POST', auth: true, body: { documentKind: kind, documentKey, selfieKey } });
      void qc.invalidateQueries({ queryKey: ['my-verification'] });
      Alert.alert('Demande envoyée', 'Notre équipe vérifie vos documents sous 48 h.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Vérification', e instanceof ApiError ? e.message : "Envoi impossible. Vérifiez votre connexion et réessayez.");
    } finally {
      setBusy(null);
    }
  };

  if (verification.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  const v = verification.data;
  if (v?.level === 'identity') {
    return <Message title="Votre identité est vérifiée" body="Le badge « Identité vérifiée » s’affiche sur vos annonces." />;
  }
  if (v?.request?.status === 'pending') {
    return <Message title="Vérification en cours" body="Notre équipe examine vos documents. Vous pourrez publier dans toutes les catégories dès leur validation." />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {v?.request?.status === 'rejected' ? (
        <View style={styles.rejected}>
          <Text style={[type.body, { fontWeight: '700' }]}>Votre précédente demande a été refusée</Text>
          {v.request.rejectionReason ? <Text style={type.body}>{v.request.rejectionReason}</Text> : null}
        </View>
      ) : null}

      <Text style={type.body}>
        Le badge « Identité vérifiée » rassure les acheteurs. Il est obligatoire pour publier dans l’immobilier et les véhicules.
      </Text>

      <View style={styles.step}>
        <Text style={type.heading}>Votre pièce d’identité</Text>
        <View style={styles.wrap}>
          {DOCS.map((d) => (
            <Chip key={d.value} label={d.label} selected={kind === d.value} onPress={() => setKind(d.value)} />
          ))}
        </View>
        <Text style={type.small}>Posez-la à plat, bien éclairée, entière dans le cadre, sans reflet.</Text>
        <Shot uri={doc} loading={busy === 'doc'} label="Photographier la pièce" onPress={() => void capture('doc')} />
      </View>

      <View style={styles.step}>
        <Text style={type.heading}>Un selfie avec la pièce</Text>
        <Text style={type.small}>Tenez la pièce à côté de votre visage. Visage et photo de la pièce doivent être nets.</Text>
        <Shot uri={selfie} loading={busy === 'selfie'} label="Prendre le selfie" onPress={() => void capture('selfie')} />
      </View>

      <View style={styles.privacy}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.inkMuted} />
        <Text style={[type.small, { flex: 1 }]}>
          Vos documents ne sont jamais publiés. Seule notre équipe de vérification les consulte, et ils sont effacés si vous supprimez votre compte.
        </Text>
      </View>

      <Button label="Envoyer ma demande" onPress={() => void submit()} loading={busy === 'send'} disabled={!doc || !selfie || !!busy} />
    </ScrollView>
  );
}

function Shot({ uri, loading, label, onPress }: { uri: string | null; loading: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.shot} accessibilityRole="button" accessibilityLabel={uri ? `${label} (reprendre)` : label}>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : uri ? (
        <>
          <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.retake}>
            <Text style={styles.retakeText}>Reprendre</Text>
          </View>
        </>
      ) : (
        <>
          <Ionicons name="camera-outline" size={28} color={colors.primary} />
          <Text style={styles.shotText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  rejected: { backgroundColor: colors.warningBg, borderRadius: 10, padding: space.lg, gap: space.xs },
  step: { gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  shot: {
    height: 180,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  shotText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  retake: { position: 'absolute', bottom: space.sm, right: space.sm, backgroundColor: 'rgba(22,32,27,0.75)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  retakeText: { color: colors.bg, fontSize: 13, fontWeight: '700' },
  privacy: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
