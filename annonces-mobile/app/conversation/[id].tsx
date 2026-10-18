import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
// La navigation est intégrée à expo-router : ne pas installer @react-navigation à part (contexte différent)
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../src/components/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../../src/api/client';
import { useMe } from '../../src/api/hooks';
import type { ChatMessage, ConversationMeta, ConversationPayload } from '../../src/api/types';
import { Message } from '../../src/components/Message';
import { PriceTag } from '../../src/components/PriceTag';
import { OfferCard } from '../../src/components/OfferCard';
import { OfferSheet } from '../../src/components/OfferSheet';
import { ReviewBanner } from '../../src/components/ReviewBanner';
import { MESSAGE_WARNINGS } from '../../src/lib/messageWarnings';
import { isOnline, useNetwork } from '../../src/lib/network';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, space, type } from '../../src/theme';

const POLL_MS = 4000; // relevé des nouveaux messages tant que la conversation est affichée
let tempId = -1;

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const qc = useQueryClient();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const msgsRef = useRef<ChatMessage[]>([]);
  msgsRef.current = msgs;
  const [otherRead, setOtherRead] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [offerOpen, setOfferOpen] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const lastId = useRef(0);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    const statuses = new Map(incoming.filter((m) => m.offer).map((m) => [m.offer!.id, m.offer!.status]));
    setMsgs((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const updated = prev.map((m) => (m.offer && statuses.has(m.offer.id) ? { ...m, offer: { ...m.offer, status: statuses.get(m.offer.id)! } } : m));
      return [...updated, ...incoming.filter((m) => !known.has(m.id))];
    });
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
  }, []);

  // Premier chargement. La dernière version est gardée sur le téléphone : hors connexion, on la relit.
  const cacheKey = `app.conv.${id}`;
  useEffect(() => {
    api<ConversationPayload>(`/conversations/${id}`, { auth: true })
      .then((r) => {
        setMeta(r.conversation);
        setOtherRead(r.otherLastReadAt);
        setHasOlder(r.hasOlder);
        merge(r.messages);
        void qc.invalidateQueries({ queryKey: ['unread-count'] });
        void AsyncStorage.setItem(cacheKey, JSON.stringify({ ...r, messages: r.messages.slice(-50) })).catch(() => undefined);
      })
      .catch(async (e) => {
        const raw = await AsyncStorage.getItem(cacheKey).catch(() => null);
        if (raw && !(e instanceof ApiError && e.status >= 400)) {
          const r = JSON.parse(raw) as ConversationPayload;
          setMeta(r.conversation);
          setOtherRead(r.otherLastReadAt);
          merge(r.messages);
        } else setError(e instanceof ApiError ? e.message : 'Conversation indisponible.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, merge, qc]);

  // Retour du réseau : les messages en attente partent d'eux-mêmes
  const { online } = useNetwork();
  useEffect(() => {
    if (!online) return;
    for (const m of msgsRef.current) if (m.queued) void send(m.body, m.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Relevé régulier, uniquement quand l’écran est affiché (économie de batterie et de forfait)
  useFocusEffect(
    useCallback(() => {
      const t = setInterval(() => {
        if (!lastId.current && !meta) return;
        api<ConversationPayload>(`/conversations/${id}?after=${lastId.current || 1}`, { auth: true })
          .then((r) => {
            merge(r.messages);
            setOtherRead(r.otherLastReadAt);
          })
          .catch(() => undefined); // réseau instable : on réessaie au prochain tour
      }, POLL_MS);
      return () => clearInterval(t);
    }, [id, merge, meta]),
  );

  const refresh = useCallback(() => {
    api<ConversationPayload>(`/conversations/${id}?after=${lastId.current || 1}`, { auth: true })
      .then((r) => merge(r.messages))
      .catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['inbox'] });
  }, [id, merge, qc]);

  const actOnOffer = async (offerId: string, action: 'accept' | 'decline' | 'withdraw') => {
    const run = async () => {
      setActing(offerId);
      try {
        await api(`/offers/${offerId}/${action}`, { method: 'POST', auth: true });
        refresh();
      } catch (e) {
        Alert.alert('Offre', e instanceof ApiError ? e.message : 'Action impossible. Réessayez.');
        refresh();
      } finally {
        setActing(null);
      }
    };
    if (action === 'accept') {
      Alert.alert('Accepter cette offre ?', 'L’acheteur sera prévenu. Convenez ensuite d’un rendez-vous ; marquez l’annonce vendue après la vente.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Accepter', onPress: () => void run() },
      ]);
    } else void run();
  };

  const loadOlder = async () => {
    const first = msgs.find((m) => m.id > 0);
    if (!hasOlder || !first) return;
    const r = await api<ConversationPayload>(`/conversations/${id}?before=${first.id}`, { auth: true }).catch(() => null);
    if (!r) return;
    setHasOlder(r.hasOlder);
    setMsgs((prev) => [...r.messages, ...prev]);
  };

  const send = async (body: string, retryOf?: number) => {
    const myId = me.data?.id;
    if (!myId || !body.trim()) return;
    const temp: ChatMessage = { id: retryOf ?? tempId--, senderId: myId, body: body.trim(), flags: [], createdAt: new Date().toISOString() };
    setMsgs((prev) => (retryOf ? prev.map((m) => (m.id === retryOf ? { ...temp, failed: false, queued: false } : m)) : [...prev, temp]));
    if (!retryOf) setText('');
    try {
      const saved = await api<ChatMessage>(`/conversations/${id}/messages`, { method: 'POST', auth: true, body: { body: temp.body } });
      setMsgs((prev) => prev.map((m) => (m.id === temp.id ? saved : m)));
      lastId.current = Math.max(lastId.current, saved.id);
      void qc.invalidateQueries({ queryKey: ['inbox'] });
    } catch (e) {
      // Pas de réseau : le message attend et partira au retour de la connexion ; sinon, échec à réessayer
      const offline = !isOnline() || (e instanceof ApiError && e.status === 0);
      setMsgs((prev) => prev.map((m) => (m.id === temp.id ? (offline ? { ...m, queued: true } : { ...m, failed: true }) : m)));
      if (!offline && e instanceof ApiError) Alert.alert('Message non envoyé', e.message);
    }
  };

  const openMenu = () => {
    if (!meta?.other) return;
    const other = meta.other;
    const report = (reason: 'scam' | 'harassment') =>
      api<{ message: string }>(`/conversations/${id}/report`, { method: 'POST', auth: true, body: { reason } })
        .then((r) => Alert.alert('Signalement envoyé', r.message))
        .catch((e) => Alert.alert('Signalement', e instanceof ApiError ? e.message : 'Envoi impossible.'));
    const toggleBlock = () =>
      api(`/users/${other.id}/block`, { method: meta.iBlocked ? 'DELETE' : 'POST', auth: true })
        .then(() => setMeta({ ...meta, iBlocked: !meta.iBlocked }))
        .catch(() => Alert.alert('Action impossible', 'Réessayez.'));
    Alert.alert(other.displayName, undefined, [
      { text: "Signaler une arnaque", style: 'destructive', onPress: () => void report('scam') },
      { text: 'Signaler un comportement insultant', onPress: () => void report('harassment') },
      { text: meta.iBlocked ? 'Débloquer' : 'Bloquer cette personne', onPress: () => void toggleBlock() },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  // Liste inversée : le message le plus récent en bas, le défilement part du bas
  const data = useMemo(() => [...msgs].reverse(), [msgs]);
  const myId = me.data?.id;
  const lastMineSeen = useMemo(() => {
    if (!otherRead) return null;
    const mine = msgs.filter((m) => m.senderId === myId && m.id > 0 && m.createdAt <= otherRead);
    return mine.length ? mine[mine.length - 1].id : null;
  }, [msgs, myId, otherRead]);

  if (error) return <Message title={error} actionLabel="Retour" onAction={() => router.back()} />;
  if (!meta) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;

  const otherInactive = !meta.other || meta.other.status === 'banned' || meta.other.status === 'deleted';
  const canWrite = !otherInactive && !meta.iBlocked;
  // « Faire une offre » : l'acheteur, sur une annonce « Je propose » en ligne avec un prix (hors Emploi), sans offre en attente
  const l = meta.listing;
  const offerPrice = l && (l.priceType === 'fixed' || l.priceType === 'negotiable') ? l.priceXaf : null;
  const hasPendingOffer = msgs.some((m) => m.senderId === myId && m.offer?.status === 'pending');
  const canOffer =
    canWrite && meta.role === 'buyer' && !!l && l.status === 'active' && l.adType !== 'request' && l.parentSlug !== 'emploi' && l.priceType !== 'free' && !hasPendingOffer;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
      <Stack.Screen
        options={{
          title: meta.other?.displayName ?? 'Utilisateur supprimé',
          headerRight: () => (
            <Pressable onPress={openMenu} hitSlop={12} accessibilityRole="button" accessibilityLabel="Signaler ou bloquer">
              <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color={colors.ink} />
            </Pressable>
          ),
        }}
      />
      {meta.listing ? (
        <Pressable style={styles.listing} onPress={() => router.push(`/listing/${meta.listing!.id}`)} accessibilityRole="button">
          <Image source={meta.listing.thumbnailUrl ?? undefined} style={styles.listingThumb} contentFit="cover" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.body} numberOfLines={1}>{meta.listing.title}</Text>
            <PriceTag priceType={meta.listing.priceType} priceXaf={meta.listing.priceXaf} />
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
        </Pressable>
      ) : null}
      <ReviewBanner conversationId={meta.id} />

      <FlatList
        data={data}
        inverted
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        onEndReached={() => void loadOlder()}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          <Text style={styles.safety}>
            {meta?.listing?.parentSlug === 'emploi'
              ? 'Restez sur la messagerie. Un vrai recruteur ne demande jamais d’argent (frais de dossier, formation, tenue…) : dans ce cas, signalez la conversation.'
              : 'Restez sur la messagerie jusqu’à la rencontre. Ne payez jamais à l’avance et vérifiez l’article avant de payer.'}
          </Text>
        }
        renderItem={({ item }) => {
          const mine = item.senderId === myId;
          if (item.kind === 'offer') {
            return <OfferCard message={item} mine={mine} isSeller={meta.role === 'seller'} busy={acting === item.offer?.id} onAction={(oid, a) => void actOnOffer(oid, a)} />;
          }
          if (item.kind && item.kind !== 'text') return <Text style={styles.system}>{item.body}</Text>;
          return (
            <View style={[styles.bubbleRow, mine ? styles.right : styles.left]}>
              <Pressable
                disabled={!item.failed}
                onPress={() => void send(item.body, item.id)}
                style={[styles.bubble, mine ? styles.mine : styles.theirs, item.failed && styles.failed]}
              >
                <Text style={[styles.text, mine && { color: colors.bg }]} selectable>{item.body}</Text>
              </Pressable>
              {!mine && item.flags.length
                ? item.flags.map((f) => (
                    <View key={f} style={styles.warning}>
                      <Ionicons name="warning" size={14} color={colors.ink} />
                      <Text style={styles.warningText}>{MESSAGE_WARNINGS[f]}</Text>
                    </View>
                  ))
                : null}
              {item.failed ? <Text style={styles.meta}>Non envoyé. Touchez pour réessayer.</Text> : null}
              {item.queued ? <Text style={styles.meta}>En attente du réseau…</Text> : null}
              {item.id < 0 && !item.failed && !item.queued ? <Text style={styles.meta}>Envoi…</Text> : null}
              {item.id === lastMineSeen ? <Text style={styles.meta}>Vu</Text> : null}
            </View>
          );
        }}
      />

      {canOffer ? (
        <View style={styles.offerBar}>
          <Pressable onPress={() => setOfferOpen(true)} style={styles.offerBtn} accessibilityRole="button">
            <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
            <Text style={styles.offerBtnText}>Faire une offre</Text>
          </Pressable>
        </View>
      ) : null}
      {l ? (
        <OfferSheet
          visible={offerOpen}
          listingId={l.id}
          price={offerPrice}
          onClose={() => setOfferOpen(false)}
          onSent={() => {
            setOfferOpen(false);
            refresh();
          }}
        />
      ) : null}
      {canWrite ? (
        <View style={[styles.composer, { paddingBottom: space.sm + insets.bottom }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Votre message"
            placeholderTextColor={colors.inkMuted}
            multiline
            maxLength={2000}
            style={styles.input}
            accessibilityLabel="Votre message"
          />
          <Pressable onPress={() => void send(text)} disabled={!text.trim()} style={[styles.send, !text.trim() && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Envoyer">
            <Ionicons name="send" size={20} color={colors.bg} />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.closed, { paddingBottom: space.md + insets.bottom }]}>
          <Text style={type.small}>{meta.iBlocked ? 'Vous avez bloqué cette personne.' : "Ce compte n’est plus actif."}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  listing: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  listingThumb: { width: 44, height: 44, borderRadius: 6, backgroundColor: colors.surface },
  safety: { textAlign: 'center', fontSize: 13, color: colors.inkMuted, padding: space.lg },
  bubbleRow: { maxWidth: '82%', gap: 4 },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  failed: { opacity: 0.6 },
  text: { fontSize: 16, lineHeight: 22, color: colors.ink },
  warning: { flexDirection: 'row', gap: 6, backgroundColor: colors.warningBg, borderRadius: 8, padding: 8 },
  warningText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.ink },
  meta: { fontSize: 12, color: colors.inkMuted },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bg },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16, color: colors.ink },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  closed: { padding: space.md, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  system: { alignSelf: 'center', fontSize: 13, color: colors.inkMuted, textAlign: 'center', paddingVertical: space.xs },
  offerBar: { flexDirection: 'row', paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  offerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintLine },
  offerBtnText: { color: colors.primary, fontSize: 14 },
});
