'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { call, ClientError, safeReturn, useSignedIn } from '@/lib/client';
import { SITE_NAME } from '@/lib/site';

interface Me { termsAccepted?: boolean; termsVersion?: string; phone: string | null }

/**
 * Acceptation explicite des CGU (case à cocher), demandée après la connexion et à chaque nouvelle version.
 * L'API garde chaque acceptation (version, date, IP, appareil) : c'est la preuve en cas de litige.
 * Ensuite : vérification du numéro si le compte n'en a pas (e-mail, Google), puis retour à la page d'origine.
 */
export default function AcceptTermsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const back = safeReturn(sp.get('retour'));
  const signedIn = useSignedIn();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (signedIn === false) router.replace(`/connexion?retour=${encodeURIComponent(back)}`);
    if (signedIn) call<Me>('/auth/me').then(setMe).catch(() => setError('Chargement impossible. Réessayez.'));
  }, [signedIn, router, back]);

  const next = (m: Me) => (m.phone ? back : `/verifier-numero?retour=${encodeURIComponent(back)}&bienvenue=1`);

  const accept = async () => {
    if (!me?.termsVersion) return;
    setBusy(true);
    setError(null);
    try {
      const u = await call<Me>('/me/terms', { method: 'POST', body: { version: me.termsVersion, platform: 'web' } });
      router.replace(next(u));
      router.refresh();
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Action impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  if (!me) return <div className="narrow"><p className="muted">{error ?? 'Chargement…'}</p></div>;
  return (
    <div className="auth-page">
      <div className="narrow stack auth-card">
        <h1>Conditions d’utilisation</h1>
        <p>Pour publier, contacter un vendeur, écrire ou postuler sur {SITE_NAME}, lisez et acceptez nos conditions. En bref :</p>
        <ul className="terms-summary">
          <li>{SITE_NAME} met en relation acheteurs et vendeurs ; nous ne sommes partie à aucune vente et aucun paiement ne passe par nous.</li>
          <li>Ne payez jamais à l’avance : vérifiez l’article et payez à la remise.</li>
          <li>Vous êtes responsable de vos annonces et de vos messages ; les fraudes sont sanctionnées et signalées aux autorités.</li>
          <li>Litiges : réclamation écrite et règlement amiable d’abord ; droit camerounais, tribunaux de Douala.</li>
        </ul>
        <p><Link href="/conditions" target="_blank">Lire les conditions complètes</Link> · <Link href="/confidentialite" target="_blank">Confidentialité</Link></p>
        <label className="check panel">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>J’ai lu et j’accepte les conditions générales d’utilisation et la politique de confidentialité.</span>
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="btn" type="button" disabled={!checked || busy} onClick={() => void accept()}>Accepter et continuer</button>
      </div>
    </div>
  );
}
