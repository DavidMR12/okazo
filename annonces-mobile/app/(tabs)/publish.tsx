import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { api } from '../../src/api/client';
import { useMe } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/AuthProvider';
import { ListingForm, ListingValues } from '../../src/components/ListingForm';
import { Message } from '../../src/components/Message';

export default function PublishScreen() {
  const { status } = useAuth();
  const me = useMe();
  const qc = useQueryClient();

  if (status !== 'signedIn') {
    return (
      <Message
        title="Vendez ce dont vous n’avez plus besoin"
        body="Connectez-vous avec votre numéro pour publier une annonce."
        actionLabel="Se connecter"
        onAction={() => router.push('/login')}
      />
    );
  }
  if (me.data?.status === 'suspended') {
    return <Message title="Publication suspendue" body="Votre compte est suspendu. Vous pourrez publier à nouveau à la fin de la suspension." />;
  }

  const create = async (v: ListingValues) => {
    await api('/listings', {
      method: 'POST',
      auth: true,
      body: {
        adType: v.adType,
        categoryId: v.categoryId,
        cityId: v.cityId,
        districtId: v.districtId ?? undefined,
        handDelivery: v.handDelivery,
        paymentMethods: v.paymentMethods,
        title: v.title,
        description: v.description,
        priceType: v.priceType,
        priceXaf: v.priceXaf ?? undefined,
        condition: v.condition,
        attributes: v.attributes,
        imageKeys: v.photoKeys,
      },
    });
    void qc.invalidateQueries({ queryKey: ['my-listings'] });
    Alert.alert('Annonce envoyée', 'Elle sera en ligne après une vérification rapide. Suivez son statut dans « Mes annonces ».', [
      { text: 'Voir mes annonces', onPress: () => router.push('/my-listings') },
      { text: 'OK' },
    ]);
  };

  return <ListingForm stepped draftKey="app.publishDraft" submitLabel="Publier l’annonce" onSubmit={create} />;
}
