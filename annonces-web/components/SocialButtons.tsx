'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Boutons « Continuer avec Google » et « Continuer avec Facebook ». Chacun n'apparaît que s'il est configuré
 * (identifiant public ici, et côté API). Le jeton obtenu est remis à onToken : l'API le vérifie elle-même.
 */
const GOOGLE_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const FACEBOOK_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? '';

interface GoogleId {
  accounts: { id: { initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void; renderButton: (el: HTMLElement, o: Record<string, unknown>) => void } };
}
interface Fb {
  init: (o: { appId: string; version: string; cookie?: boolean; xfbml?: boolean }) => void;
  login: (cb: (r: { authResponse?: { accessToken: string } }) => void, o: { scope: string }) => void;
}
declare global {
  interface Window { google?: GoogleId; FB?: Fb; fbAsyncInit?: () => void }
}

const loadScript = (src: string, id: string) =>
  new Promise<void>((resolve, reject) => {
    if (document.getElementById(id)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.id = id;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(src));
    document.head.appendChild(s);
  });

export function SocialButtons({ enabled, onToken, label = 'Continuer' }: {
  enabled: { google: boolean; facebook: boolean };
  onToken: (provider: 'google' | 'facebook', token: string) => void;
  label?: string;
}) {
  const googleBox = useRef<HTMLDivElement>(null);
  const [fbReady, setFbReady] = useState(false);
  const showGoogle = enabled.google && !!GOOGLE_ID;
  const showFacebook = enabled.facebook && !!FACEBOOK_ID;
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!showGoogle) return;
    loadScript('https://accounts.google.com/gsi/client', 'gsi')
      .then(() => {
        const g = window.google;
        if (!g || !googleBox.current) return;
        g.accounts.id.initialize({ client_id: GOOGLE_ID, callback: (r) => onTokenRef.current('google', r.credential) });
        g.accounts.id.renderButton(googleBox.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'fr', width: 300 });
      })
      .catch(() => undefined);
  }, [showGoogle]);

  useEffect(() => {
    if (!showFacebook) return;
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: FACEBOOK_ID, version: 'v21.0' });
      setFbReady(true);
    };
    loadScript('https://connect.facebook.net/fr_FR/sdk.js', 'facebook-jssdk').catch(() => undefined);
    if (window.FB) window.fbAsyncInit();
  }, [showFacebook]);

  if (!showGoogle && !showFacebook) return null;
  return (
    <div className="social stack">
      <div className="social-sep"><span>ou</span></div>
      {showGoogle ? <div ref={googleBox} className="social-google" /> : null}
      {showFacebook ? (
        <button
          type="button"
          className="btn social-facebook"
          disabled={!fbReady}
          onClick={() => window.FB?.login((r) => r.authResponse && onTokenRef.current('facebook', r.authResponse.accessToken), { scope: 'public_profile,email' })}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden focusable={false}><path fill="#fff" d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9h3l.5-4h-3.5V8.8c0-.5.3-.8.5-.8z" /></svg>
          {label} avec Facebook
        </button>
      ) : null}
      <p className="muted small" style={{ margin: 0 }}>Avec Google ou Facebook, nous vous demanderons aussi votre numéro avant de publier ou de contacter : cela protège tout le monde contre les arnaques.</p>
    </div>
  );
}
