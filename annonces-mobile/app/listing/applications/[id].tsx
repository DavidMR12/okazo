import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../../src/api/client';
import { useListingApplications, useSetApplicationStatus } from '../../../src/api/hooks';
import type { ReceivedApplication } from '../../../src/api/types';
import { Button } from '../../../src/components/Button';
import { Message } from '../../../src/components/Message';
import { Text } from '../../../src/components/Typography';
import { VerifiedBadge } from '../../../src/components/VerifiedBadge';
import { EMPLOYER_STATUS } from '../../../src/lib/applications';
import { memberSince, relativeTime } from '../../../src/lib/format';
import { colors, space, type } from '../../../src/theme';
import { dialog } from '../../../src/components/Dialog';

/** Candidatures reçues pour une offre d'emploi : lire, ouvrir le CV, répondre, retenir ou écarter. */
export default function ListingApplicationsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useListingApplications(id);
  const setStatus = useSetApplicationStatus(id);
  const [opening, setOpening] = useState<string | null>(null);

  if (q.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  if (q.isError) return <Message title="Impossible de charger les candidatures" actionLabel="Réessayer" onAction={() => void q.refetch()} />;

  // Lien de 5 minutes vers le CV (dossier privé), ouvert dans le navigateur du téléphone
  const openCv = async (a: ReceivedApplication) => {
    setOpening(a.id);
    try {
      const { url } = await api<{ url: string }>(`/me/applications/${a.id}/cv`, { auth: true });
      await Linking.openURL(url);
    } catch (e) {
      dialog('CV', e instanceof ApiError ? e.message : 'Impossible d’ouvrir le CV.');
    } finally {
      setOpening(null);
    }
  };
  const decide = (a: ReceivedApplication, status: 'shortlisted' | 'rejected') =>
    setStatus.mutate(
      { id: a.id, status: a.status === status ? 'viewed' : status }, // retoucher annule
      { onError: (e) => dialog('Candidature', e instanceof ApiError ? e.message : 'Action impossible.') },
    );

  return (
    <>
      <Stack.Screen options={{ title: `Candidatures (${q.data.items.length})` }} />
      <FlatList
        data={q.data.items}
        keyExtractor={(a) => a.id}
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}
        ListHeaderComponent={<Text style={type.small} numberOfLines={2}>{q.data.listing.title}</Text>}
        ListEmptyComponent={<Message title="Pas encore de candidature" body="Vous serez prévenu dans la messagerie à chaque nouvelle candidature." />}
        renderItem={({ item: a }) => {
          const s = EMPLOYER_STATUS[a.status];
          return (
            <View style={styles.card}>
              <View style={styles.head}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{a.applicant.displayName.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.heading}>{a.applicant.displayName}</Text>
                  {a.applicant.verificationLevel === 'identity' ? <VerifiedBadge /> : null}
                  <Text style={type.small}>
                    {memberSince(a.applicant.memberSince)} · reçue {relativeTime(a.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.badge, { color: s.color, backgroundColor: s.bg }]}>{s.label}</Text>
              </View>
              <Text style={type.body}>{a.message}</Text>
              {a.hasCv ? (
                <Pressable style={styles.cv} onPress={() => void openCv(a)} disabled={opening === a.id} accessibilityRole="button">
                  <Ionicons name={a.cvContentType === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={20} color={colors.primary} />
                  <Text style={styles.cvText}>{opening === a.id ? 'Ouverture…' : 'Voir le CV'}</Text>
                </Pressable>
              ) : (
                <Text style={type.small}>Pas de CV joint</Text>
              )}
              <View style={styles.actions}>
                {a.conversationId ? <Button label="Répondre" onPress={() => router.push(`/conversation/${a.conversationId}`)} style={{ flex: 1 }} /> : null}
                <Button label={a.status === 'shortlisted' ? 'Retenue ✓' : 'Retenir'} variant="secondary" onPress={() => decide(a, 'shortlisted')} style={{ flex: 1 }} />
                <Button label={a.status === 'rejected' ? 'Écartée' : 'Écarter'} variant="secondary" onPress={() => decide(a, 'rejected')} style={{ flex: 1 }} />
              </View>
            </View>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontSize: 17 },
  badge: { fontSize: 12, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  cv: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', paddingVertical: space.xs },
  cvText: { color: colors.primary, fontSize: 15, textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', gap: space.sm },
});
