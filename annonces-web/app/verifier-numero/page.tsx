'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PhoneCodeForm } from '@/components/PhoneCodeForm';
import { call, safeReturn, useSignedIn } from '@/lib/client';
import type { Country } from '@/lib/types';

/**
 * Compte créé avec Google ou Facebook : vérifier un numéro (une seule fois) pour publier, contacter, écrire,
 * faire une offre ou postuler. On peut passer cette étape et parcourir les annonces en attendant.
 */
export default function VerifyPhonePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const back = safeReturn(sp.get('retour'));
  const welcome = sp.get('bienvenue') === '1';
  const signedIn = useSignedIn();
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [channels, setChannels] = useState<('sms' | 'whatsapp')[]>(['sms']);

  useEffect(() => {
    if (signedIn === false) router.replace(`/connexion?retour=${encodeURIComponent(`/verifier-numero?retour=${encodeURIComponent(back)}`)}`);
  }, [signedIn, router, back]);
  useEffect(() => {
    void Promise.all([
      call<{ countries: Country[] }>('/geo/countries').then((r) => r.countries).catch(() => []),
      call<{ otpChannels: ('sms' | 'whatsapp')[] }>('/auth/methods').then((r) => r.otpChannels).catch(() => ['sms' as const]),
    ]).then(([c, ch]) => {
      setCountries(c.length ? c : [{ code: 'CM', name: 'Cameroun', dialCode: '+237', currencyCode: 'XAF' }]);
      setChannels(ch);
    });
  }, []);

  if (!countries) return <div className="narrow"><p className="muted">Chargement…</p></div>;
  return (
    <div className="auth-page">
    <div className="narrow stack auth-card">
      {welcome ? <p className="notice-ok">Bienvenue ! Votre compte est créé.</p> : null}
      <PhoneCodeForm
        countries={countries}
        channels={channels}
        title="Vérifiez votre numéro"
        intro="Une seule fois : il faut un numéro vérifié pour publier, contacter un vendeur, écrire ou postuler. Il n’apparaît jamais dans vos annonces."
        sendCode={(phone, channel) => call('/me/phone/request', { method: 'POST', body: { phone, channel } })}
        verifyCode={async (phone, code) => {
          await call('/me/phone/verify', { method: 'POST', body: { phone, code } });
          router.replace(back);
          router.refresh();
        }}
      />
      <Link href={back} className="link-button" style={{ alignSelf: 'center' }}>Plus tard</Link>
    </div>
    </div>
  );
}
