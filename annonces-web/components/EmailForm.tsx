'use client';

import { FormEvent, useState } from 'react';
import { authCall, ClientError } from '@/lib/client';

type Mode = 'login' | 'register' | 'confirm' | 'forgot' | 'reset';

/**
 * Connexion par e-mail et mot de passe. L'inscription se confirme par un code reçu par e-mail (l'adresse doit
 * être la sienne) ; « Mot de passe oublié » envoie aussi un code. Comme avec Google, un numéro vérifié est demandé
 * ensuite, une seule fois, avant de publier ou de contacter un vendeur.
 */
export function EmailForm({ country, onDone }: { country: string; onDone: (phoneRequired: boolean, termsAccepted: boolean) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
    setCode('');
    if (m !== 'reset' && m !== 'confirm') setPassword('');
  };

  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Action impossible. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const strong = password.length >= 8 && /\p{L}/u.test(password) && /\d/.test(password);
  const emailField = (
    <div className="field">
      <label htmlFor="email">Adresse e-mail</label>
      <input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" />
    </div>
  );
  const passwordField = (label: string, autoComplete: 'current-password' | 'new-password') => (
    <div className="field">
      <label htmlFor="password">{label}</label>
      <div className="password-row">
        <input id="password" type={show ? 'text' : 'password'} autoComplete={autoComplete} required minLength={autoComplete === 'new-password' ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="button" className="link-button" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? 'Masquer' : 'Afficher'}</button>
      </div>
      {autoComplete === 'new-password' ? <p className={`hint ${password && !strong ? 'error' : 'muted'}`}>8 caractères au moins, avec une lettre et un chiffre.</p> : null}
    </div>
  );
  const err = error ? <p className="error" role="alert">{error}</p> : null;

  if (mode === 'login') {
    return (
      <form className="stack" onSubmit={run(async () => {
        const r = await authCall<{ phoneRequired: boolean; user?: { termsAccepted?: boolean } }>('email/login', { email, password });
        onDone(r.phoneRequired, r.user?.termsAccepted !== false);
      })}>
        {emailField}
        {passwordField('Mot de passe', 'current-password')}
        {err}
        <button className="btn" type="submit" disabled={loading || !email || !password}>Se connecter</button>
        <div className="email-links">
          <button type="button" className="link-button" onClick={() => go('forgot')}>Mot de passe oublié ?</button>
          <button type="button" className="link-button" onClick={() => go('register')}>Créer un compte</button>
        </div>
      </form>
    );
  }

  if (mode === 'register') {
    return (
      <form className="stack" onSubmit={run(async () => {
        await authCall('email/register', { email, password, displayName: name.trim(), country });
        setNotice(`Code envoyé à ${email.trim().toLowerCase()}. Il expire dans 15 min (pensez à regarder dans les courriers indésirables).`);
        setMode('confirm');
      })}>
        <div className="field">
          <label htmlFor="name">Votre nom (affiché sur vos annonces)</label>
          <input id="name" autoComplete="name" required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Awa N." />
        </div>
        {emailField}
        {passwordField('Choisissez un mot de passe', 'new-password')}
        {err}
        <button className="btn" type="submit" disabled={loading || name.trim().length < 2 || !email || !strong}>Créer mon compte</button>
        <button type="button" className="link-button" onClick={() => go('login')}>J’ai déjà un compte</button>
      </form>
    );
  }

  if (mode === 'forgot') {
    return (
      <form className="stack" onSubmit={run(async () => {
        await authCall('email/forgot', { email });
        setNotice(`Si un compte existe pour ${email.trim().toLowerCase()}, un code vient d’y être envoyé.`);
        setMode('reset');
      })}>
        <p className="muted" style={{ margin: 0 }}>Indiquez votre adresse : nous vous envoyons un code pour choisir un nouveau mot de passe.</p>
        {emailField}
        {err}
        <button className="btn" type="submit" disabled={loading || !email}>Recevoir un code</button>
        <button type="button" className="link-button" onClick={() => go('login')}>Retour à la connexion</button>
      </form>
    );
  }

  // Code reçu par e-mail : confirmation de l'inscription, ou nouveau mot de passe
  const confirming = mode === 'confirm';
  return (
    <form className="stack" onSubmit={run(async () => {
      const r = confirming
        ? await authCall<{ phoneRequired: boolean; user?: { termsAccepted?: boolean } }>('email/verify', { email, code })
        : await authCall<{ phoneRequired: boolean; user?: { termsAccepted?: boolean } }>('email/reset', { email, code, password });
      onDone(r.phoneRequired, r.user?.termsAccepted !== false);
    })}>
      {notice ? <p className="notice-ok">{notice}</p> : null}
      <div className="field">
        <label htmlFor="email-code">Code à 6 chiffres</label>
        <input id="email-code" className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      </div>
      {!confirming ? passwordField('Nouveau mot de passe', 'new-password') : null}
      {err}
      <button className="btn" type="submit" disabled={loading || code.length !== 6 || (!confirming && !strong)}>{confirming ? 'Confirmer mon adresse' : 'Enregistrer le mot de passe'}</button>
      <button type="button" className="link-button" onClick={() => go(confirming ? 'register' : 'forgot')}>Renvoyer un code</button>
    </form>
  );
}
