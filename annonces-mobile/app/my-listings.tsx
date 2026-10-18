import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/Typography';
import { ApiError } from '../src/api/client';
import { useListingAction, useMyListings } from '../src/api/hooks';
import type { MyListing } from '../src/api/types';
import { Message } from '../src/components/Message';
import { PriceTag } from '../src/components/PriceTag';
import { colors, space, type } from '../src/theme';

const EDITABLE: MyListing['status'][] = ['active', 'rejected', 'expired'];

const STATUS: Record<MyListing['status'], { label: string; color: string }> = {
  active: { label: 'En ligne', color: colors.trust },
  pending_review: { label: 'En cours de vérification', color: colors.primary },
  rejected: { label: 'Refusée', color: colors.danger },
  sold: { label: 'Vendue', color: colors.inkMuted },
  expired: { label: 'Expirée', color: colors.inkMuted },
  draft: { label: 'Brouillon', color: colors.inkMuted },
  removed: { label: 'Supprimée', color: colors.inkMuted },
};

export default function MyListingsScreen() {
  const listings = useMyListings();
  const action = useListingAction();

  const run = (id: string, kind: 'sold' | 'delete') =>
    action.mutate({ id, action: kind }, { onError: (e) => Alert.alert('Annonce', e instanceof ApiError ? e.message : 'Action impossible.') });

  const confirm = (item: MyListing) => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (EDITABLE.includes(item.status)) buttons.push({ text: item.status === 'expired' ? 'Republier' : 'Modifier', onPress: () => router.push(`/listing/edit/${item.id}`) });
    if (item.status === 'active') buttons.push({ text: 'Marquer comme vendue', onPress: () => run(item.id, 'sold') });
    buttons.push({ text: 'Supprimer', style: 'destructive', onPress: () => run(item.id, 'delete') });
    buttons.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert(item.title, undefined, buttons);
  };

  if (listings.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;

  return (
    <FlatList
      data={listings.data ?? []}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => {
        const s = STATUS[item.status];
        return (
          <Pressable
            onPress={() =>
              item.status === 'rejected' || item.status === 'expired'
                ? router.push(`/listing/edit/${item.id}`) // refusée : on corrige ; expirée : on republie
                : item.status === 'active' || item.status === 'sold'
                  ? router.push(`/listing/${item.id}`)
                  : confirm(item)
            }
            onLongPress={() => confirm(item)}
            style={styles.row}
            accessibilityRole="button"
            accessibilityHint="Appui long pour modifier, marquer vendue ou supprimer"
          >
            <Image source={item.thumbnailUrl ?? undefined} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={2}>{item.title}</Text>
              <PriceTag priceType={item.priceType} priceXaf={item.priceXaf} />
              <Text style={[styles.status, { color: s.color }]}>{s.label}</Text>
              {item.status === 'rejected' && item.rejectionReason ? <Text style={type.small}>{item.rejectionReason} Touchez pour corriger.</Text> : null}
              {item.status === 'expired' ? <Text style={type.small}>Touchez pour republier.</Text> : null}
              {item.parentSlug === 'emploi' && item.adType === 'offer' ? (
                <Pressable onPress={() => router.push(`/listing/applications/${item.id}`)} hitSlop={8} accessibilityRole="button" style={styles.apps}>
                  <Text style={styles.appsText}>
                    {item.applications ? `${item.applications} candidature${item.applications > 1 ? 's' : ''}` : 'Aucune candidature'}
                    {item.newApplications ? ` · ${item.newApplications} nouvelle${item.newApplications > 1 ? 's' : ''}` : ''}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        listings.isError ? (
          <Message title="Impossible de charger vos annonces" actionLabel="Réessayer" onAction={() => void listings.refetch()} />
        ) : (
          <Message title="Vous n’avez pas encore d’annonce" body="Publiez votre première annonce depuis l’onglet Publier." />
        )
      }
      ListHeaderComponent={listings.data?.length ? <Text style={[type.small, { padding: space.lg }]}>Appui long sur une annonce pour la modifier, la marquer vendue ou la supprimer.</Text> : null}
      refreshControl={<RefreshControl refreshing={listings.isRefetching} onRefresh={() => void listings.refetch()} tintColor={colors.primary} />}
      style={{ backgroundColor: colors.bg }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  thumb: { width: 80, height: 80, borderRadius: 8, backgroundColor: colors.surface },
  status: { fontSize: 13, fontWeight: '700' },
  apps: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', backgroundColor: colors.tint, borderRadius: 6, paddingHorizontal: space.sm, paddingVertical: 4 },
  appsText: { color: colors.primary, fontSize: 13 },
});
