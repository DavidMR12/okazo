'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authCall, call, ClientError, notifyAuthChange, useSignedIn } from '@/lib/client';
import { SocialButtons } from '@/components/SocialButtons';

interface Me { identities?: ('google' | 'facebook')[]; displayName: string; phone: string | null; verificationLevel: 'phone' | 'identity'; status: string; role: 'user' | 'moderator' | 'admin'; contactPreference: 'all' | 'messages_only' }

export default function AccountPage() {
  const signedIn = useSignedIn();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'code'>('idle');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    call<Me>('/auth/me')
      .then((m) => { setMe(m); setName(m.displayName); })
      .catch(() => undefined);
  }, [signedIn]);

  if (signedIn === false) {
    return (
      <div className="narrow stack">
        <h1>Mon compte</h1>
        <Link href="/connexion?retour=/compte" className="btn">Se connecter</Link>
      </div>
    );
  }
  if (!me) return <div className="narrow"><p className="muted">Chargement…</p></div>;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof ClientError ? e.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="narrow stack">
      <h1>Mon compte</h1>
      {me.phone ? (
        <p className="muted">{me.phone}</p>
      ) : (
        <p className="notice-warn">Pas encore de numéro vérifié : il en faut un pour publier, contacter ou écrire. <Link href="/verifier-numero?retour=/compte">Vérifier mon numéro</Link></p>
      )}
      {me.verificationLevel === 'identity' ? <p className="verified">✓ Identité vérifiée</p> : <p className="muted">Identité non vérifiée : la vérification se fait depuis l’application mobile.</p>}

      <div className="chip-wrap"><Link href="/messages" className="btn btn-secondary">Messages</Link><Link href="/mes-annonces" className="btn btn-secondary">Mes annonces</Link><Link href="/favoris" className="btn btn-secondary">Mes favoris</Link><Link href="/recherches" className="btn btn-secondary">Mes recherches</Link><Link href="/candidatures" className="btn btn-secondary">Mes candidatures</Link><Link href="/publier" className="btn btn-secondary">Publier une annonce</Link>{me.role !== 'user' ? <Link href="/admin" className="btn">Modération</Link> : null}</div>

      <LinkedAccounts me={me} onChange={(identities) => setMe({ ...me, identities })} />

      <form className="stack" onSubmit={(e) => { e.preventDefault(); void run(async () => { await call('/me', { method: 'PATCH', body: { displayName: name.trim() } }); setMessage('Nom enregistré.'); }); }}>
        <div className="field">
          <label htmlFor="name">Nom affiché sur vos annonces</label>
          <input id="name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={busy || name.trim().length < 2 || name.trim() === me.displayName}>Enregistrer le nom</button>
      </form>

      <label className="check panel">
        <input
          type="checkbox"
          checked={me.contactPreference === 'messages_only'}
          disabled={busy}
          onChange={(e) => {
            const pref = e.target.checked ? 'messages_only' : 'all';
            void run(async () => {
              await call('/me', { method: 'PATCH', body: { contactPreference: pref } });
              setMe({ ...me, contactPreference: pref });
              setMessage(pref === 'messages_only' ? 'Les acheteurs vous contacteront uniquement par la messagerie.' : 'Les acheteurs peuvent aussi vous contacter par WhatsApp ou téléphone.');
            });
          }}
        />
        <span><strong>Messagerie uniquement</strong><br /><span className="muted">Votre numéro n’est jamais donné : les acheteurs vous écrivent sur le site ou l’application.</span></span>
      </label>

      {message ? <p role="status">{message}</p> : null}

      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void run(async () => { await authCall('logout'); router.replace('/'); })}>
        Se déconnecter
      </button>

      <section className="stack" style={{ marginTop: 32 }}>
        <h2>Supprimer mon compte</h2>
        <p className="muted">Votre numéro, votre nom, vos annonces, vos favoris et vos documents d’identité seront effacés. Cette action est irréversible.</p>
        {deleteStep === 'idle' ? (
          <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void run(async () => { await call('/me/delete/request', { method: 'POST' }); setDeleteStep('code'); })}>
            Recevoir un code de confirmation
          </button>
        ) : (
          <form className="stack" onSubmit={(e) => {
            e.preventDefault();
            if (!window.confirm('Supprimer définitivement votre compte ?')) return;
            void run(async () => {
              await call('/me', { method: 'DELETE', body: { code } });
              await authCall('logout').catch(() => undefined); // efface les cookies de session
              notifyAuthChange();
              router.replace('/');
            });
          }}>
            <div className="field">
              <label htmlFor="del-code">Code reçu par SMS</label>
              <input id="del-code" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </div>
            <button className="btn btn-danger" type="submit" disabled={busy || code.length !== 6}>Supprimer mon compte</button>
          </form>
        )}
      </section>
    </div>
  );
}

/** Comptes Google et Facebook associés : pour se connecter en un clic sur un autre appareil. */
function LinkedAccounts({ me, onChange }: { me: Me; onChange: (ids: ('google' | 'facebook')[]) => void }) {
  const [methods, setMethods] = useState<{ google: boolean; facebook: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    call<{ google: boolean; facebook: boolean }>('/auth/methods').then(setMethods).catch(() => undefined);
  }, []);
  if (!methods || (!methods.google && !methods.facebook)) return null;
  const linked = me.identities ?? [];
  const link = async (provider: 'google' | 'facebook', token: string) => {
    setError(null);
    try {
      onChange((await call<{ identities: ('google' | 'facebook')[] }>('/me/identities', { method: 'POST', body: { provider, token } })).identities);
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Association impossible.');
    }
  };
  const unlink = async (provider: 'google' | 'facebook') => {
    setError(null);
    try {
      onChange((await call<{ identities: ('google' | 'facebook')[] }>(`/me/identities/${provider}`, { method: 'DELETE' })).identities);
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Action impossible.');
    }
  };
  return (
    <section className="stack" aria-labelledby="h-linked">
      <h2 id="h-linked">Comptes associés</h2>
      <div className="linked">
        {linked.map((p) => (
          <div key={p} className="linked-row">
            <span>{p === 'google' ? 'Google' : 'Facebook'} : associé</span>
            <button type="button" className="link-button" onClick={() => void unlink(p)}>Retirer</button>
          </div>
        ))}
      </div>
      <SocialButtons enabled={{ google: methods.google && !linked.includes('google'), facebook: methods.facebook && !linked.includes('facebook') }} onToken={(p, t) => void link(p, t)} label="Associer" />
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
  );
}
