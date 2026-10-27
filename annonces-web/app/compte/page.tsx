'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  addCircleOutline, arrowUpCircleOutline, briefcaseOutline, callOutline, chatbubblesOutline, chevronForward, documentTextOutline,
  earthOutline, flagOutline, flameOutline, gridOutline, heartOutline, helpBuoyOutline, helpCircleOutline, languageOutline, linkOutline,
  lockClosedOutline, logOutOutline, mailOutline, notificationsOutline, optionsOutline, personOutline, pricetagsOutline, readerOutline,
  settingsOutline, shieldCheckmarkOutline, shieldOutline, sparklesOutline, storefrontOutline, timeOutline, trashOutline,
} from 'ionicons/icons';
import { reopenConsent } from '@/components/consent';
import { DECOR_ACCOUNT, Decor } from '@/components/Decor';
import { CGU_VERSION, SUPPORT_EMAIL } from '@/lib/site';

// « 2026-10-15 » → « 15 octobre 2026 »
const frenchDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
import { authCall, call, ClientError, notifyAuthChange, useSignedIn } from '@/lib/client';
import { SocialButtons } from '@/components/SocialButtons';
import { DetailCard } from '@/components/DetailCard';
import { Ion } from '@/components/Ion';
import { confirmDialog } from '@/components/Dialog';

interface Me { identities?: ('google' | 'facebook')[]; displayName: string; phone: string | null; email?: string | null; countryCode?: string; verificationLevel: 'phone' | 'identity'; status: string; role: 'user' | 'moderator' | 'admin'; contactPreference: 'all' | 'messages_only' }

/**
 * « Mon compte » : carte de profil, puis des cadres comme sur la page d'annonce
 * (activité, profil et contact, comptes associés, sécurité), la suppression du compte repliée en bas.
 */
export default function AccountPage() {
  const signedIn = useSignedIn();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'code'>('idle');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    if (!signedIn) return;
    call<Me>('/auth/me')
      .then((m) => { setMe(m); setName(m.displayName); })
      .catch(() => undefined);
    call<{ countries: { code: string; name: string }[] }>('/geo/countries').then((r) => setCountries(r.countries)).catch(() => undefined);
  }, [signedIn]);

  if (signedIn === false) {
    return (
      <div className="account">
        <h1 className="pill-title">Mon compte</h1>
        <div className="empty-card empty-tall">
          <Decor icons={DECOR_ACCOUNT} />
          <span className="empty-halo"><span className="empty-icon"><Ion icon={personOutline} size={34} /></span></span>
          <p>Connectez-vous pour publier, contacter les vendeurs et retrouver vos favoris sur tous vos appareils.</p>
          <Link href="/connexion?retour=/compte" className="btn">Se connecter</Link>
        </div>
      </div>
    );
  }
  if (!me) return <div className="account"><p className="muted">Chargement…</p></div>;

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

  const countryName = countries.find((c) => c.code === me.countryCode)?.name ?? me.countryCode ?? '—';
  const initials = me.displayName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  const tiles: { href: string; icon: string; label: string; hint: string }[] = [
    { href: '/mes-annonces', icon: pricetagsOutline, label: 'Mes annonces', hint: 'Gérer vos annonces en ligne' },
    { href: '/messages', icon: chatbubblesOutline, label: 'Messages', hint: 'Vos conversations' },
    { href: '/favoris', icon: heartOutline, label: 'Mes favoris', hint: 'Les annonces gardées' },
    { href: '/recherches', icon: notificationsOutline, label: 'Mes recherches', hint: 'Alertes de nouvelles annonces' },
    { href: '/candidatures', icon: briefcaseOutline, label: 'Mes candidatures', hint: 'Offres d’emploi' },
    ...(me.role !== 'user' ? [{ href: '/admin', icon: shieldOutline, label: 'Modération', hint: 'Signalements et contrôles' }] : []),
  ];

  return (
    <div className="account">
      <h1 className="pill-title">Mon compte</h1>

      {/* Carte de profil : avatar, nom, coordonnées, niveau de vérification */}
      <section className="account-hero" aria-label="Votre profil">
        <span className="account-avatar" aria-hidden>{initials}</span>
        <div className="account-who">
          <strong className="account-name">{me.displayName}</strong>
          <span className="account-line"><Ion icon={callOutline} size={16} /> {me.phone ?? 'Aucun numéro vérifié'}</span>
          {me.email ? <span className="account-line"><Ion icon={mailOutline} size={16} /> {me.email}</span> : null}
          <span className="account-badges">
            {me.verificationLevel === 'identity'
              ? <span className="account-badge ok"><Ion icon={shieldCheckmarkOutline} size={15} /> Identité vérifiée</span>
              : <span className="account-badge"><Ion icon={shieldOutline} size={15} /> Identité non vérifiée</span>}
            {me.role !== 'user' ? <span className="account-badge">{me.role === 'admin' ? 'Administrateur' : 'Modérateur'}</span> : null}
          </span>
        </div>
        <Link href="/publier" className="btn account-publish"><Ion icon={addCircleOutline} size={20} /> Publier une annonce</Link>
      </section>

      {!me.phone ? (
        <p className="notice-warn">Pas encore de numéro vérifié : il en faut un pour publier, contacter ou écrire. <Link href="/verifier-numero?retour=/compte">Vérifier mon numéro</Link></p>
      ) : null}
      {message ? <p className="account-status" role="status">{message}</p> : null}

      <DetailCard id="h-activity" icon={gridOutline} title="Mon activité">
        <div className="account-tiles">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href} className="account-tile">
              <span className="fact-icon"><Ion icon={t.icon} size={20} /></span>
              <span className="account-tile-text"><strong>{t.label}</strong><span>{t.hint}</span></span>
              <Ion icon={chevronForward} size={18} className="account-chevron" />
            </Link>
          ))}
        </div>
      </DetailCard>

      <DetailCard id="h-profile" icon={personOutline} title="Profil et contact">
        <form className="account-name-form" onSubmit={(e) => { e.preventDefault(); void run(async () => { await call('/me', { method: 'PATCH', body: { displayName: name.trim() } }); setMe({ ...me, displayName: name.trim() }); setMessage('Nom enregistré.'); }); }}>
          <div className="field">
            <label htmlFor="name">Nom affiché sur vos annonces</label>
            <div className="account-inline">
              <input id="name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <button className="btn" type="submit" disabled={busy || name.trim().length < 2 || name.trim() === me.displayName}>Enregistrer</button>
            </div>
          </div>
        </form>

        <label className="account-switch">
          <span className="account-switch-text">
            <strong>Messagerie uniquement</strong>
            <span className="muted">Votre numéro n’est jamais donné : les acheteurs vous écrivent sur le site ou l’application.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
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
        </label>
      </DetailCard>

      <LinkedAccounts me={me} onChange={(identities) => setMe({ ...me, identities })} />

      <DetailCard id="h-security" icon={lockClosedOutline} title="Sécurité">
        <div className="account-rows">
          <div className="account-row">
            <span className="account-tile-text">
              <strong>Vérification d’identité</strong>
              <span>{me.verificationLevel === 'identity' ? 'Votre identité est vérifiée : un badge rassure les acheteurs.' : 'Elle se fait depuis l’application mobile (pièce d’identité et photo).'}</span>
            </span>
          </div>
          <div className="account-row">
            <span className="account-tile-text"><strong>Session</strong><span>Vous êtes connecté sur cet appareil.</span></span>
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void run(async () => { await authCall('logout'); router.replace('/'); })}>
              <Ion icon={logOutOutline} size={18} /> Se déconnecter
            </button>
          </div>
        </div>
      </DetailCard>

      <DetailCard id="h-settings" icon={settingsOutline} title="Paramètres">
        <div className="pill-rows">
          <PillRow icon={earthOutline} label="Pays" hint={countryName} />
          <PillRow icon={languageOutline} label="Langue" hint="Français" />
          <PillRow icon={optionsOutline} label="Cookies et publicité" hint="Publicités personnalisées ou non : changer votre choix" onClick={reopenConsent} />
        </div>
      </DetailCard>

      <DetailCard id="h-help" icon={helpBuoyOutline} title="Aide et contact">
        <div className="pill-rows">
          <PillRow icon={helpCircleOutline} label="Centre d’aide" hint="Questions fréquentes" href="/aide" />
          <PillRow icon={shieldCheckmarkOutline} label="Conseils de sécurité" hint="Acheter et vendre sans risque" href="/aide#securite" />
          <PillRow icon={mailOutline} label="Nous contacter" hint={SUPPORT_EMAIL || 'Adresse de contact bientôt disponible'} href={SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}` : undefined} />
        </div>
      </DetailCard>

      <DetailCard id="h-legal" icon={documentTextOutline} title="Informations juridiques">
        <div className="pill-rows">
          <PillRow icon={readerOutline} label="Conditions d’utilisation" hint={`Version du ${frenchDate(CGU_VERSION)}`} href="/conditions" />
          <PillRow icon={lockClosedOutline} label="Confidentialité" hint="Vos données et vos droits" href="/confidentialite" />
          <PillRow icon={flagOutline} label="Signaler un contenu illicite" hint="Arnaque, contrefaçon, contenu interdit : comment faire" href="/aide#signaler" />
        </div>
      </DetailCard>

      <DetailCard id="h-offers" icon={sparklesOutline} title="Nos offres" chip={<><Ion icon={timeOutline} size={15} /> Bientôt</>}>
        <div className="pill-rows">
          <PillRow icon={flameOutline} label="Annonce à la une" hint="Votre annonce en tête de l’accueil, avec le badge « À la une »." soon />
          <PillRow icon={arrowUpCircleOutline} label="Remontée en tête de liste" hint="Votre annonce revient en haut des résultats, comme neuve." soon />
          <PillRow icon={storefrontOutline} label="Vitrine professionnelle" hint="Pour les commerçants : page boutique et annonces illimitées." soon />
        </div>
        <p className="offers-note">Paiement par Mobile Money (MTN, Orange, Airtel, Moov…) à l’ouverture des offres.</p>
      </DetailCard>

      <details className="account-danger">
        <summary><Ion icon={trashOutline} size={18} /> Supprimer mon compte</summary>
        <div className="stack">
          <p className="muted">Votre numéro, votre nom, vos annonces, vos favoris et vos documents d’identité seront effacés. Cette action est irréversible.</p>
          {deleteStep === 'idle' ? (
            <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void run(async () => { await call('/me/delete/request', { method: 'POST' }); setDeleteStep('code'); })}>
              Recevoir un code de confirmation
            </button>
          ) : (
            <form className="stack" onSubmit={async (e) => {
              e.preventDefault();
              if (!(await confirmDialog('Supprimer définitivement votre compte ?', { message: 'Vos annonces, favoris et documents seront effacés.', confirm: 'Supprimer', danger: true }))) return;
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
        </div>
      </details>
    </div>
  );
}

/** Rangée ovale : pastille ronde avec icône, libellé, sous-titre ; lien, bouton, ou simple information. */
function PillRow({ icon, label, hint, href, onClick, soon }: { icon: string; label: string; hint?: string; href?: string; onClick?: () => void; soon?: boolean }) {
  const inner = (
    <>
      <span className="pill-icon"><Ion icon={icon} size={20} /></span>
      <span className="account-tile-text"><strong>{label}</strong>{hint ? <span>{hint}</span> : null}</span>
      {soon ? <span className="soon-tag">Bientôt</span> : href || onClick ? <Ion icon={chevronForward} size={18} className="account-chevron" /> : null}
    </>
  );
  if (href?.startsWith('/')) return <Link href={href} className="pill-row">{inner}</Link>;
  if (href) return <a href={href} className="pill-row">{inner}</a>;
  if (onClick) return <button type="button" className="pill-row" onClick={onClick}>{inner}</button>;
  return <div className="pill-row">{inner}</div>;
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
    <DetailCard id="h-linked" icon={linkOutline} title="Comptes associés">
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
    </DetailCard>
  );
}
