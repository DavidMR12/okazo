'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ListingForm, ListingValues } from '@/components/ListingForm';
import { call, useSignedIn } from '@/lib/client';
import type { Category, City } from '@/lib/types';

interface Me { countryCode: string; cityId: number | null; status: string; verificationLevel: 'phone' | 'identity' }

export function PublishForm({ categories, citiesByCountry, walletsByCountry }: { categories: Category[]; citiesByCountry: Record<string, City[]>; walletsByCountry: Record<string, string[]> }) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (signedIn === false) router.replace('/connexion?retour=/publier');
    if (signedIn) call<Me>('/auth/me').then(setMe).catch(() => undefined);
  }, [signedIn, router]);

  if (!signedIn || !me) return <div className="narrow"><p className="muted">Chargement…</p></div>;
  if (me.status === 'suspended') {
    return (
      <div className="narrow stack">
        <h1>Publication suspendue</h1>
        <p>Votre compte est suspendu. Vous pourrez publier à nouveau à la fin de la suspension.</p>
      </div>
    );
  }

  const create = async (v: ListingValues) => {
    await call('/listings', {
      method: 'POST',
      body: {
        adType: v.adType,
        categoryId: v.categoryId,
        cityId: v.cityId,
        districtId: v.districtId ?? undefined,
        cityOther: v.cityOther ?? undefined,
        districtOther: v.districtOther ?? undefined,
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
    router.push('/mes-annonces?publiee=1');
  };

  return (
    <ListingForm
      heading="Publier une annonce"
      categories={categories}
      cities={citiesByCountry[me.countryCode] ?? []}
      walletsByCountry={walletsByCountry}
      defaultCityId={me.cityId}
      identityVerified={me.verificationLevel === 'identity'}
      stepped
      draftKey="app.publishDraft"
      submitLabel="Publier l’annonce"
      onSubmit={create}
    />
  );
}
