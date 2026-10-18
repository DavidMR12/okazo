import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ApiError } from '../../src/api/client';
import { useApply, useMyApplications } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/AuthProvider';
import { Button } from '../../src/components/Button';
import { Message } from '../../src/components/Message';
import { Text, TextInput } from '../../src/components/Typography';
import { CANDIDATE_STATUS } from '../../src/lib/applications';
import { compressImage, CvType, uploadCv } from '../../src/lib/upload';
import { colors, space, TITLE_FONT, type } from '../../src/theme';

const MIN = 20;
interface Cv {
  uri: string;
  name: string;
  type: CvType;
}

/** Postuler à une offre d'emploi : un message de présentation et, si possible, un CV (PDF ou photo). */
export default function ApplyScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const { status } = useAuth();
  const existing = useMyApplications(id);
  const apply = useApply();
  const [message, setMessage] = useState('');
  const [cv, setCv] = useState<Cv | null>(null);
  const [busy, setBusy] = useState(false);
  const [showError, setShowError] = useState(false);

  if (status !== 'signedIn') {
    return <Message title="Connectez-vous pour postuler" body="Le recruteur doit pouvoir vous répondre." actionLabel="Se connecter" onAction={() => router.push('/login')} />;
  }
  if (existing.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  const already = existing.data?.[0];
  if (already) {
    const s = CANDIDATE_STATUS[already.status];
    return (
      <Message
        title="Vous avez déjà postulé"
        body={`Statut : ${s.label}. Échangez avec le recruteur dans la messagerie.`}
        actionLabel={already.conversationId ? 'Voir la conversation' : undefined}
        onAction={already.conversationId ? () => router.replace(`/conversation/${already.conversationId}`) : undefined}
      />
    );
  }

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    if (a.size && a.size > 5_000_000) {
      Alert.alert('CV trop lourd', 'Le fichier dépasse 5 Mo. Prenez plutôt votre CV en photo.');
      return;
    }
    setCv({ uri: a.uri, name: a.name, type: 'application/pdf' });
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Appareil photo', 'Autorisez l’accès à l’appareil photo dans les réglages du téléphone.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    // Un CV doit rester lisible : on compresse moins qu'une photo d'annonce
    const c = await compressImage(a.uri, a.width, a.height, 2000, 0.8);
    setCv({ uri: c.uri, name: 'Photo du CV', type: 'image/jpeg' });
  };

  const send = async () => {
    setShowError(true);
    if (message.trim().length < MIN) return;
    setBusy(true);
    try {
      const cvKey = cv ? await uploadCv(id, cv.uri, cv.type) : undefined;
      const res = await apply.mutateAsync({ listingId: id, message: message.trim(), cvKey });
      Alert.alert('Candidature envoyée', 'Le recruteur la reçoit avec votre message. Suivez son statut dans Compte, puis Mes candidatures.', [
        { text: 'Voir la conversation', onPress: () => router.replace(`/conversation/${res.conversationId}`) },
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Candidature', e instanceof ApiError || e instanceof Error ? e.message : 'Envoi impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  const tooShort = showError && message.trim().length < MIN;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {title ? (
          <View style={{ gap: 2 }}>
            <Text style={type.small}>Vous postulez à</Text>
            <Text style={[type.title, { fontFamily: TITLE_FONT }]}>{title}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={type.heading}>Votre message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Présentez-vous : votre expérience, vos disponibilités, pourquoi ce poste vous intéresse."
            placeholderTextColor={colors.inkMuted}
            multiline
            maxLength={2000}
            style={[styles.input, tooShort && { borderColor: colors.danger }]}
          />
          {tooShort ? <Text style={styles.error}>Présentez-vous en quelques phrases (20 caractères au moins).</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={type.heading}>Votre CV</Text>
          <Text style={type.small}>Facultatif. PDF ou photo de votre CV, 5 Mo au plus. Seul le recruteur peut l’ouvrir.</Text>
          {cv ? (
            <View style={styles.file}>
              <Ionicons name={cv.type === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={22} color={colors.primary} />
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{cv.name}</Text>
              <Pressable onPress={() => setCv(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Retirer le CV">
                <Text style={styles.remove}>Retirer</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.row}>
              <Button label="Joindre un PDF" icon="document-attach-outline" variant="secondary" onPress={() => void pickPdf()} style={{ flex: 1 }} />
              <Button label="Photo du CV" icon="camera-outline" variant="secondary" onPress={() => void takePhoto()} style={{ flex: 1 }} />
            </View>
          )}
        </View>

        <View style={styles.notice}>
          <Text style={type.body}>Un vrai recruteur ne demande jamais d’argent pour un emploi (frais de dossier, formation, tenue…). Dans ce cas, signalez l’annonce.</Text>
        </View>

        <Button label={busy ? 'Envoi…' : 'Envoyer ma candidature'} onPress={() => void send()} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl * 2 },
  section: { gap: space.sm },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, padding: space.md, minHeight: 160, fontSize: 16, color: colors.ink, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 14 },
  row: { flexDirection: 'row', gap: space.sm },
  file: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: colors.tintLine, backgroundColor: colors.tint, borderRadius: 10, padding: space.md },
  remove: { color: colors.primary, fontSize: 14 },
  notice: { backgroundColor: colors.warningBg, borderRadius: 10, padding: space.lg },
});
