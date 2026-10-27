import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../src/components/Typography';
import { api, ApiError } from '../../src/api/client';
import { useListing } from '../../src/api/hooks';
import { cardShadow, SafetyNote } from '../../src/components/Blocks';
import { Button } from '../../src/components/Button';
import { DetailCard } from '../../src/components/DetailCard';
import { PriceTag } from '../../src/components/PriceTag';
import { colors, space, TITLE_FONT } from '../../src/theme';

const MAX = 2000;

/**
 * Premier message à un vendeur (même direction artistique que le site) : l'annonce en carte, le cadre
 * « Votre message » avec des messages tout prêts et un compteur. Si une conversation existe déjà, on l'ouvre.
 */
export default function NewConversationScreen() {
  // message : texte préparé (ex. depuis le panier, avec tous les articles du vendeur)
  const { listingId, title, message } = useLocalSearchParams<{ listingId: string; title?: string; message?: string }>();
  const listing = useListing(listingId);
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

  const l = listing.data;
  const name = l?.title ?? title ?? '';
  // Messages tout prêts : un toucher remplace le texte
  const quick = [
    `Bonjour, votre annonce « ${name} » est-elle toujours disponible ?`,
    'Bonjour, le prix est-il négociable ?',
    'Bonjour, où et quand peut-on se rencontrer pour voir l’article ?',
    ...(l?.handDelivery ? ['Bonjour, une remise en main propre est-elle possible cette semaine ?'] : []),
  ];
  const thumb = l?.images[0]?.thumbUrl;
  const place = l ? [l.district, l.city].filter(Boolean).join(', ') : '';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.listing} onPress={() => l && router.push(`/listing/${l.id}`)} accessibilityRole="button" accessibilityLabel={name}>
          {thumb ? (
            <Image source={thumb} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Ionicons name="image-outline" size={24} color={colors.inkMuted} />
            </View>
          )}
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.title} numberOfLines={1}>{name}</Text>
            {l ? <PriceTag priceType={l.priceType} priceXaf={l.priceXaf} unit={l.priceUnit} size="sm" /> : null}
            {place ? (
              <View style={styles.meta}>
                <Ionicons name="location-outline" size={13} color={colors.inkMuted} />
                <Text style={styles.metaText} numberOfLines={1}>{place}</Text>
              </View>
            ) : null}
            {l ? (
              <Text style={styles.metaText} numberOfLines={1}>
                Vendu par <Text style={styles.seller}>{l.seller.displayName}</Text>{l.seller.verificationLevel === 'identity' ? ' · vérifié' : ''}
              </Text>
            ) : null}
          </View>
        </Pressable>

        <DetailCard icon="chatbubble-ellipses-outline" title="Votre message">
          <View style={styles.quick}>
            {quick.map((q) => {
              const on = body === q;
              return (
                <Pressable key={q} onPress={() => setBody(q)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[styles.chipText, on && { color: '#fff' }]}>{q.replace(/^Bonjour, /, '').replace(/^./, (c) => c.toUpperCase())}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.box}>
            <TextInput value={body} onChangeText={setBody} multiline maxLength={MAX} style={styles.input} accessibilityLabel="Votre message" placeholderTextColor={colors.inkMuted} />
            <Text style={styles.count}>{body.length}/{MAX}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Envoyer le message" onPress={() => void send()} loading={sending} disabled={!body.trim()} style={{ marginTop: space.md }} />
        </DetailCard>

        <View style={{ marginHorizontal: space.lg, marginTop: space.lg }}>
          <SafetyNote
            title="Restez sur la messagerie jusqu’à la rencontre"
            text="Vos échanges y sont protégés et vous pouvez signaler un comportement suspect. Ne payez jamais à l’avance : vérifiez l’article, puis payez à la remise."
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: space.xxl * 2 },
  listing: { flexDirection: 'row', alignItems: 'center', gap: space.md, margin: space.lg, marginBottom: 0, padding: space.md, borderRadius: 20, backgroundColor: colors.bg, ...cardShadow },
  thumb: { width: 80, height: 80, borderRadius: 14, backgroundColor: colors.tint },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontFamily: TITLE_FONT, color: colors.ink },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: colors.inkMuted, flexShrink: 1 },
  seller: { fontSize: 12, fontWeight: '700', color: colors.ink },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: { maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.tintLine, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  box: { borderWidth: 1.5, borderColor: '#C9D6EE', borderRadius: 16, backgroundColor: '#FBFCFF' },
  input: { minHeight: 130, padding: space.md, paddingBottom: 28, fontSize: 16, lineHeight: 22, color: colors.ink, textAlignVertical: 'top' },
  count: { position: 'absolute', right: 12, bottom: 8, fontSize: 12, color: colors.inkMuted },
  error: { color: colors.danger, fontSize: 14, marginTop: space.sm },
});
