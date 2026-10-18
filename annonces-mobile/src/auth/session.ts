import * as SecureStore from '../lib/secureStore';

const REFRESH_KEY = 'app.refreshToken';

// Le jeton d’accès (15 min) reste en mémoire ; le jeton de rafraîchissement est chiffré par le système
let accessToken: string | null = null;
let refreshToken: string | null = null;
const listeners = new Set<(signedIn: boolean) => void>();

export async function loadSession(): Promise<boolean> {
  refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  return !!refreshToken;
}

export const getAccessToken = () => accessToken;
export const getRefreshToken = () => refreshToken;

export async function setSession(access: string, refresh: string): Promise<void> {
  // Enregistré AVANT d’être utilisé : l’ancien jeton est invalidé côté serveur à chaque renouvellement
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  accessToken = access;
  const wasSignedIn = !!refreshToken;
  refreshToken = refresh;
  if (!wasSignedIn) listeners.forEach((l) => l(true));
}

export async function clearSession(): Promise<void> {
  const wasSignedIn = !!refreshToken;
  accessToken = null;
  refreshToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  if (wasSignedIn) listeners.forEach((l) => l(false));
}

export function onSessionChange(listener: (signedIn: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
