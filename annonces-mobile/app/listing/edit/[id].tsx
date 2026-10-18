import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Text } from '../../../src/components/Typography';
import { api, ApiError } from '../../../src/api/client';
import type { PriceType } from '../../../src/api/types';
import { ListingForm, ListingValues } from '../../../src/components/ListingForm';
import { Message } from '../../../src/components/Message';
import { colors, space, type } from '../../../src/theme';
import type { AdType } from '../../../src/lib/adType';

interface Editable {
  id: string;
  adType: AdType;
  status: string;
  rejectionReason: string | null;
  title: string;
  description: string;
  priceType: PriceType;
  priceXaf: number | null;
  condition: string | null;
  categoryId: number;
  cityId: number;
  districtId: number | null;
  handDelivery: boolean | null;
  paymentMethods: string[];
  attributes: Record<string, unknown>;
  editable: boolean;
  photos: { key: string; processed: boolean; url: string | null }[];
}

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['my-listing', id],
    queryFn: () => api<Editable>(`/me/listings/${id}`, { auth: true }),
    gcTime: 0, // toujours la version à jour
  });

  if (q.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  if (q.isError || !q.data) {
    return <Message title="Annonce introuvable" body={q.error instanceof ApiError ? q.error.message : undefined} actionLabel="Retour" onAction={() => router.back()} />;
  }
  const l = q.data;
  if (!l.editable) {
    return (
      <Message
        title={l.status === 'pending_review' ? 'Annonce en cours de vérification' : 'Annonce non modifiable'}
        body={l.status === 'pending_review' ? 'Vous pourrez la modifier dès la fin de la vérification, en général sous quelques minutes.' : 'Une annonce vendue ne peut plus être modifiée.'}
        actionLabel="Retour"
        onAction={() => router.back()}
      />
    );
  }

  const save = async (v: ListingValues) => {
    await api(`/listings/${id}`, {
      method: 'PATCH',
      auth: true,
      body: {
        adType: v.adType,
        categoryId: v.categoryId,
        cityId: v.cityId,
        districtId: v.districtId,
        handDelivery: v.handDelivery,
        paymentMethods: v.paymentMethods,
        title: v.title,
        description: v.description,
        priceType: v.priceType,
        priceXaf: v.priceXaf,
        condition: v.condition,
        attributes: v.attributes,
        photos: v.photoKeys,
      },
    });
    void qc.invalidateQueries({ queryKey: ['my-listings'] });
    void qc.invalidateQueries({ queryKey: ['listing', id] });
    Alert.alert('Modifications envoyées', "L’annonce repasse par une vérification rapide avant d’être de nouveau en ligne.", [{ text: 'OK', onPress: () => router.back() }]);
  };

  return (
    <ListingForm
      initial={{
        title: l.title,
        description: l.description,
        adType: l.adType,
        attributes: Object.fromEntries(Object.entries(l.attributes ?? {}).map(([k, v]) => [k, String(v)])),
        categoryId: l.categoryId,
        cityId: l.cityId,
        districtId: l.districtId,
        handDelivery: l.handDelivery ?? undefined,
        paymentMethods: l.paymentMethods ?? [],
        priceType: l.priceType,
        price: l.priceXaf ? String(l.priceXaf) : '',
        condition: l.condition ?? undefined,
      }}
      initialPhotos={l.photos.map((p) => ({ key: p.key, url: p.url }))}
      submitLabel={l.status === 'expired' ? 'Republier l’annonce' : 'Enregistrer les modifications'}
      onSubmit={save}
      header={
        <View style={styles.header}>
          {l.status === 'rejected' && l.rejectionReason ? (
            <View style={styles.rejected}>
              <Text style={[type.body, { fontWeight: '700' }]}>Annonce refusée</Text>
              <Text style={type.body}>{l.rejectionReason}</Text>
              <Text style={type.small}>Corrigez ce point puis enregistrez : l’annonce sera vérifiée à nouveau.</Text>
            </View>
          ) : null}
          {l.status === 'active' ? (
            <Text style={type.small}>Après modification, l’annonce repasse par une vérification rapide et reste hors ligne pendant ce temps, en général quelques minutes.</Text>
          ) : null}
          {l.status === 'expired' ? <Text style={type.small}>Vérifiez les informations, puis republiez : l’annonce sera de nouveau en ligne pour 30 jours.</Text> : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
  rejected: { backgroundColor: colors.warningBg, borderRadius: 10, padding: space.lg, gap: space.xs },
});
