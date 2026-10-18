import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Text, TextInput } from '../../src/components/Typography';
import { api, ApiError } from '../../src/api/client';
import { Button } from '../../src/components/Button';
import { colors, space, type } from '../../src/theme';

/** Premier message à un vendeur. Si une conversation existe déjà pour cette annonce, on l’ouvre directement. */
export default function NewConversationScreen() {
  // message : texte préparé (ex. depuis le panier, avec tous les articles du vendeur)
  const { listingId, title, message } = useLocalSearchParams<{ listingId: string; title?: string; message?: string }>();
  const [checking, setChecking] = useState(true);
  const [body, setBody] = useState(message ?? `Bonjour, votre annonce « ${title ?? ''} » est-elle toujours disponible ?`);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ id: string }>(`/conversations/with-listing/${listingId}`, { auth: true })
      .then((c) => router.replace(`/conversation/${c.id}`))
      .catch(() => setChecking(false));
  }, [listingId]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await api<{ conversationId: string }>('/conversations', { method: 'POST', auth: true, body: { listingId, body: body.trim() } });
      router.replace(`/conversation/${r.conversationId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  };

  if (checking) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={type.small}>Annonce</Text>
        <Text style={type.heading}>{title}</Text>
        <TextInput value={body} onChangeText={setBody} multiline maxLength={2000} autoFocus style={styles.input} accessibilityLabel="Votre message" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Envoyer" onPress={() => void send()} loading={sending} disabled={!body.trim()} />
        <Text style={type.small}>Restez sur la messagerie jusqu’à la rencontre : vos échanges y sont protégés et vous pouvez signaler un comportement suspect.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.md },
  input: { minHeight: 120, borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, padding: space.md, fontSize: 16, color: colors.ink, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 14 },
});
