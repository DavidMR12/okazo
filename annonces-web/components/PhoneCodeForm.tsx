'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ClientError } from '@/lib/client';
import type { Country } from '@/lib/types';
import { CountrySelect } from './CountrySelect';

export type Channel = 'sms' | 'whatsapp';

/**
 * Saisie du numéro puis du code reçu, par SMS ou par WhatsApp (au choix). Commun à la connexion et à
 * « Vérifier mon numéro » : seules les fonctions d'envoi et de vérification changent.
 */
export function PhoneCodeForm({ countries, channels, title, intro, sendCode, verifyCode, submitLabel = 'Recevoir le code', children }: {
  countries: Country[];
  channels: Channel[];
  title?: string; // absent : le titre est déjà affiché au-dessus (page de connexion)
  intro: string;
  sendCode: (phone: string, channel: Channel) => Promise<{ resendAfterSec: number }>;
  verifyCode: (phone: string, code: string) => Promise<void>;
  submitLabel?: string;
  children?: React.ReactNode; // sous le premier écran (boutons Google et Facebook)
}) {
  // Indicatif choisi dans la liste à drapeaux (+237, +241…), ajouté au numéro à l'envoi
  const [country, setCountry] = useState(countries[0]?.code ?? 'CM');
  const dial = countries.find((c) => c.code === country)?.dialCode ?? '+237';
  const [number, setNumber] = useState('');
  const [channel, setChannel] = useState<Channel>('sms');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async (e?: FormEvent, via: Channel = channel) => {
    e?.preventDefault();
    const target = phone ?? `${dial}${number.replace(/\D/g, '').replace(/^0+/, '')}`;
    setError(null);
    setLoading(true);
    try {
      const r = await sendCode(target, via);
      setChannel(via);
      setPhone(target);
      setWait(r.resendAfterSec);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Envoi impossible.');
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await verifyCode(phone!, code);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Vérification impossible.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  if (!phone) {
    return (
      <div className="stack">
        <form className="stack" onSubmit={send}>
          {title ? <h1>{title}</h1> : null}
          <p className="muted">{intro}</p>
          <div className="phone-row">
            <CountrySelect countries={countries} value={country} onChange={setCountry} showDial />
            <label className="visually-hidden" htmlFor="tel">Numéro de téléphone</label>
            <input id="tel" type="tel" inputMode="tel" autoComplete="tel-national" required value={number} onChange={(e) => setNumber(e.target.value)} placeholder="6 77 12 34 56" autoFocus />
          </div>
          {channels.includes('whatsapp') ? (
            <div className="channel-row">
              <span className="muted small">Recevoir le code par</span>
              <div className="channel-pill" role="radiogroup" aria-label="Recevoir le code par">
                <button type="button" role="radio" aria-checked={channel === 'sms'} className={channel === 'sms' ? 'on' : undefined} onClick={() => setChannel('sms')}>SMS</button>
                <button type="button" role="radio" aria-checked={channel === 'whatsapp'} className={channel === 'whatsapp' ? 'on wa' : undefined} onClick={() => setChannel('whatsapp')}>WhatsApp</button>
              </div>
            </div>
          ) : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="btn" type="submit" disabled={loading || number.replace(/\D/g, '').length < 7}>{submitLabel}</button>
        </form>
        {children}
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={verify}>
      <h1>Entrez le code reçu</h1>
      <p className="muted">Code envoyé par {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} au {dial} {(phone.startsWith(dial) ? phone.slice(dial.length) : phone).replace(/(\d{1,2})(?=(\d{2})+$)/g, '$1 ')}.</p>
      <div className="field">
        <label htmlFor="code" className="visually-hidden">Code à 6 chiffres</label>
        <input id="code" className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn" type="submit" disabled={loading || code.length !== 6}>Valider</button>
      <button className="btn btn-secondary" type="button" disabled={wait > 0 || loading} onClick={() => void send(undefined, channel)}>
        {wait > 0 ? `Renvoyer le code dans ${wait} s` : 'Renvoyer le code'}
      </button>
      {channels.includes('whatsapp') && wait <= 0 ? (
        <button className="link-button" type="button" onClick={() => void send(undefined, channel === 'sms' ? 'whatsapp' : 'sms')}>
          Recevoir plutôt par {channel === 'sms' ? 'WhatsApp' : 'SMS'}
        </button>
      ) : null}
      <button className="link-button" type="button" onClick={() => { setPhone(null); setCode(''); setError(null); }}>
        Changer de numéro
      </button>
    </form>
  );
}
