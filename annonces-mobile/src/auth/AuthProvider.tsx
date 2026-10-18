import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshSession } from '../api/client';
import { deviceFingerprint } from '../lib/device';
import { PRIVATE_KEYS } from '../lib/queryClient';
import { clearSession, getRefreshToken, loadSession, onSessionChange, setSession } from './session';

type Status = 'loading' | 'signedIn' | 'signedOut';

interface AuthContextValue {
  status: Status;
  requestCode: (phone: string, channel?: 'sms' | 'whatsapp') => Promise<{ resendAfterSec: number }>;
  /** Connexion avec Google ou Facebook (jeton vérifié par l'API). phoneRequired : compte sans numéro. */
  signInWithOAuth: (provider: 'google' | 'facebook', token: string, country?: string) => Promise<{ isNewUser: boolean; phoneRequired: boolean; termsAccepted: boolean }>;
  verifyCode: (phone: string, code: string) => Promise<{ isNewUser: boolean; termsAccepted: boolean }>;
  /** E-mail : inscription ou mot de passe oublié (envoi d'un code à l'adresse). */
  emailCode: (action: 'register' | 'forgot', body: Record<string, string>) => Promise<{ resendAfterSec: number }>;
  /** E-mail : confirmation d'inscription, connexion ou nouveau mot de passe (ouvre la session). */
  emailSession: (action: 'verify' | 'login' | 'reset', body: Record<string, string>) => Promise<{ isNewUser: boolean; phoneRequired: boolean; termsAccepted: boolean }>;
  signOut: () => Promise<void>;
  /** Après suppression du compte : oublie la session sans appeler l’API. */
  forgetSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const queryClient = useQueryClient();

  const dropPrivateData = useCallback(() => {
    PRIVATE_KEYS.forEach((key) => queryClient.removeQueries({ queryKey: [key] }));
  }, [queryClient]);

  useEffect(() => {
    let mounted = true;
    // Avec un jeton enregistré, l’utilisateur est considéré connecté même hors ligne
    loadSession().then((has) => {
      if (!mounted) return;
      setStatus(has ? 'signedIn' : 'signedOut');
      if (has) void refreshSession();
    });
    const off = onSessionChange((signedIn) => {
      setStatus(signedIn ? 'signedIn' : 'signedOut');
      if (!signedIn) dropPrivateData();
    });
    return () => {
      mounted = false;
      off();
    };
  }, [dropPrivateData]);

  const requestCode = useCallback(
    (phone: string, channel: 'sms' | 'whatsapp' = 'sms') => api<{ resendAfterSec: number }>('/auth/otp/request', { method: 'POST', body: { phone, channel } }),
    [],
  );

  const verifyCode = useCallback(async (phone: string, code: string) => {
    const device = await deviceFingerprint();
    const res = await api<{ accessToken: string; refreshToken: string; isNewUser: boolean; user: { termsAccepted?: boolean } }>('/auth/otp/verify', {
      method: 'POST',
      body: { phone, code, device },
    });
    await setSession(res.accessToken, res.refreshToken);
    return { isNewUser: res.isNewUser, termsAccepted: res.user?.termsAccepted !== false };
  }, []);

  const signInWithOAuth = useCallback(async (provider: 'google' | 'facebook', token: string, country?: string) => {
    const device = await deviceFingerprint();
    const res = await api<{ accessToken: string; refreshToken: string; isNewUser: boolean; phoneRequired: boolean; user: { termsAccepted?: boolean } }>('/auth/oauth', {
      method: 'POST',
      body: { provider, token, device, country },
    });
    await setSession(res.accessToken, res.refreshToken);
    return { isNewUser: res.isNewUser, phoneRequired: res.phoneRequired, termsAccepted: res.user?.termsAccepted !== false };
  }, []);

  const emailCode = useCallback(
    (action: 'register' | 'forgot', body: Record<string, string>) => api<{ resendAfterSec: number }>(`/auth/email/${action}`, { method: 'POST', body }),
    [],
  );

  const emailSession = useCallback(async (action: 'verify' | 'login' | 'reset', body: Record<string, string>) => {
    const device = await deviceFingerprint();
    const res = await api<{ accessToken: string; refreshToken: string; isNewUser: boolean; phoneRequired: boolean; user: { termsAccepted?: boolean } }>(`/auth/email/${action}`, {
      method: 'POST',
      body: { ...body, device },
    });
    await setSession(res.accessToken, res.refreshToken);
    return { isNewUser: res.isNewUser, phoneRequired: res.phoneRequired, termsAccepted: res.user?.termsAccepted !== false };
  }, []);

  const signOut = useCallback(async () => {
    const token = getRefreshToken();
    if (token) await api('/auth/logout', { method: 'POST', body: { refreshToken: token } }).catch(() => undefined);
    await clearSession();
    dropPrivateData();
  }, [dropPrivateData]);

  const forgetSession = useCallback(async () => {
    await clearSession();
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ status, requestCode, verifyCode, signInWithOAuth, emailCode, emailSession, signOut, forgetSession }),
    [status, requestCode, verifyCode, signInWithOAuth, emailCode, emailSession, signOut, forgetSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
