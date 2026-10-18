'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ListingForm, ListingValues } from '@/components/ListingForm';
import { call, ClientError, useSignedIn } from '@/lib/client';
import type { Category, City, PriceType } from '@/lib/types';
import type { AdType } from '@/lib/adType';

interface Editable {
  id: string; adType: AdType; status: string; rejectionReason: string | null; title: string; description: string;
  priceType: PriceType; priceXaf: number | null; condition: string | null; categoryId: number; cityId: number; districtId: number | null; handDelivery: boolean | null; paymentMethods: string[]; attributes: Record<string, unknown>;
  editable: boolean; photos: { key: string; processed: boolean; url: string | null }[];
}
interface Me { countryCode: string; verificationLevel: 'phone' | 'identity' }

export function EditListing({ id, categories, citiesByCountry, walletsByCountry }: { id: string; categories: Category[]; citiesByCountry: Record<string, City[]>; walletsByCountry: Record<string, string[]> }) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const [l, setL] = useState<Editable | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (signedIn === false) router.replace(`/connexion?retour=/mes-annonces/${id}/modifier`);
    if (!signedIn) return;
    call<Me>('/auth/me').then(setMe).catch(() => undefined);
    call<Editable>(`/me/listings/${id}`).then(setL).catch((e) => setError(e instanceof ClientError ? e.message : 'Annonce introuvable.'));
  }, [signedIn, id, router]);

  if (error) return <div className="narrow stack"><p className="error">{error}</p><Link href="/mes-annonces">Mes annonces</Link></div>;
  if (!l || !me) return <div className="narrow"><p className="muted">Chargement…</p></div>;
  if (!l.editable) {
    return (
      <div className="narrow stack">
        <h1>{l.status === 'pending_review' ? 'Annonce en cours de vérification' : 'Annonce non modifiable'}</h1>
        <p>{l.status === 'pending_review' ? 'Vous pourrez la modifier dès la fin de la vérification, en général sous quelques minutes.' : 'Une annonce vendue ne peut plus être modifiée.'}</p>
        <Link href="/mes-annonces" className="btn btn-secondary">Mes annonces</Link>
      </div>
    );
  }

  const save = async (v: ListingValues) => {
    await call(`/listings/${id}`, {
      method: 'PATCH',
      body: {
        adType: v.adType, categoryId: v.categoryId, cityId: v.cityId, districtId: v.districtId, handDelivery: v.handDelivery, paymentMethods: v.paymentMethods, title: v.title, description: v.description,
        priceType: v.priceType, priceXaf: v.priceXaf, condition: v.condition, attributes: v.attributes, photos: v.photoKeys,
      },
    });
    router.push('/mes-annonces?modifiee=1');
  };

  // La ville actuelle peut appartenir à un autre pays que celui du compte : on propose les villes de ce pays
  const cities = Object.values(citiesByCountry).find((list) => list.some((c) => c.id === l.cityId)) ?? citiesByCountry[me.countryCode] ?? [];

  return (
    <ListingForm
      heading={l.status === 'expired' ? 'Republier l’annonce' : "Modifier l'annonce"}
      header={
        <>
          {l.status === 'rejected' && l.rejectionReason ? (
            <div className="safety">
              <strong>Annonce refusée</strong>
              <p>{l.rejectionReason}</p>
              <p>Corrigez ce point puis enregistrez : l’annonce sera vérifiée à nouveau.</p>
            </div>
          ) : null}
          {l.status === 'active' ? <p className="muted" style={{ margin: 0 }}>Après modification, l’annonce repasse par une vérification rapide et reste hors ligne pendant ce temps, en général quelques minutes.</p> : null}
          {l.status === 'expired' ? <p className="muted" style={{ margin: 0 }}>Vérifiez les informations, puis republiez : l’annonce sera de nouveau en ligne pour 30 jours.</p> : null}
        </>
      }
      categories={categories}
      cities={cities}
      walletsByCountry={walletsByCountry}
      identityVerified={me.verificationLevel === 'identity'}
      initial={{
        adType: l.adType, attributes: Object.fromEntries(Object.entries(l.attributes ?? {}).map(([k, v]) => [k, String(v)])), title: l.title, description: l.description, categoryId: l.categoryId, cityId: l.cityId, districtId: l.districtId, handDelivery: l.handDelivery ?? undefined, paymentMethods: l.paymentMethods ?? [],
        priceType: l.priceType, price: l.priceXaf ? String(l.priceXaf) : '', condition: l.condition ?? undefined,
      }}
      initialPhotos={l.photos.map((p) => ({ key: p.key, url: p.url }))}
      submitLabel={l.status === 'expired' ? 'Republier' : 'Enregistrer les modifications'}
      onSubmit={save}
    />
  );
}
