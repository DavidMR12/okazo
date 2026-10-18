'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmailForm } from '@/components/EmailForm';
import { PhoneCodeForm } from '@/components/PhoneCodeForm';
import { SocialButtons } from '@/components/SocialButtons';
import { authCall, ClientError, safeReturn } from '@/lib/client';
import type { Country } from '@/lib/types';

interface Methods { otpChannels: ('sms' | 'whatsapp')[]; google: boolean; facebook: boolean; email?: boolean }

/**
 * Connexion ou inscription : par téléphone (code par SMS ou WhatsApp), par e-mail et mot de passe, ou avec Google
 * (décision du porteur, 15 octobre 2026 ; Facebook retiré). Sans numéro (e-mail, Google), un numéro vérifié est
 * demandé ensuite, une seule fois, avant d'agir.
 */
export function LoginForm({ countries, returnTo, methods }: { countries: Country[]; returnTo?: string; methods: Methods }) {
  const router = useRouter();
  const [tab, setTab] = useState<'phone' | 'email'>('phone');
  const [error, setError] = useState<string | null>(null);
  // Après la connexion : acceptation des CGU si besoin (preuve en cas de litige), puis numéro à vérifier
  // pour un compte sans numéro (e-mail ou Google, on peut passer), puis la page d'origine
  const done = (phoneRequired = false, termsAccepted = true) => {
    const back = safeReturn(returnTo);
    const afterTerms = phoneRequired ? `/verifier-numero?retour=${encodeURIComponent(back)}&bienvenue=1` : back;
    router.replace(termsAccepted ? afterTerms : `/conditions/accepter?retour=${encodeURIComponent(back)}`);
    router.refresh();
  };

  const google = async (provider: 'google' | 'facebook', token: string) => {
    setError(null);
    try {
      const r = await authCall<{ phoneRequired: boolean; user?: { termsAccepted?: boolean } }>('oauth', { provider, token, country: countries[0]?.code });
      done(r.phoneRequired, r.user?.termsAccepted !== false);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Connexion impossible.');
    }
  };

  return (
    <div className="stack">
      <h1>Connexion ou inscription</h1>
      {methods.email !== false ? (
        <div className="channel-pill login-tabs" role="tablist" aria-label="Se connecter avec">
          <button type="button" role="tab" aria-selected={tab === 'phone'} className={tab === 'phone' ? 'on' : undefined} onClick={() => setTab('phone')}>Téléphone</button>
          <button type="button" role="tab" aria-selected={tab === 'email'} className={tab === 'email' ? 'on' : undefined} onClick={() => setTab('email')}>E-mail</button>
        </div>
      ) : null}

      {tab === 'phone' ? (
        <PhoneCodeForm
          countries={countries}
          channels={methods.otpChannels}
          intro={`Nous vous envoyons un code par SMS${methods.otpChannels.includes('whatsapp') ? ' ou WhatsApp' : ''}. Pas de mot de passe à retenir.`}
          sendCode={(phone, channel) => authCall('request', { phone, channel })}
          verifyCode={async (phone, code) => {
            const r = await authCall<{ user?: { termsAccepted?: boolean } }>('verify', { phone, code });
            done(false, r.user?.termsAccepted !== false);
          }}
        />
      ) : (
        <EmailForm country={countries[0]?.code ?? 'CM'} onDone={(phoneRequired, termsAccepted) => done(phoneRequired, termsAccepted)} />
      )}

      <SocialButtons enabled={{ google: methods.google, facebook: false }} onToken={(p, t) => void google(p, t)} />
      {error ? <p className="error" role="alert">{error}</p> : null}
      <p className="muted small">En continuant, vous acceptez les <Link href="/conditions" target="_blank">conditions d’utilisation</Link> et la <Link href="/confidentialite" target="_blank">politique de confidentialité</Link>.</p>
    </div>
  );
}
