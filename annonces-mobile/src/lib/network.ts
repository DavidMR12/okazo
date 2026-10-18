import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/**
 * État du réseau partagé par toute l'application :
 * - online : connexion disponible (sinon bandeau « Hors connexion » et données du cache) ;
 * - slow : réseau mobile 2G/3G (économie de données automatique) ;
 * - saver : option « Économie de données » choisie dans Compte.
 * React Query suit aussi cet état : rien n'est tenté hors connexion, tout repart au retour du réseau.
 */
interface NetworkState {
  online: boolean;
  slow: boolean;
  saver: boolean;
}
const SAVER_KEY = 'app.dataSaver';
let state: NetworkState = { online: true, slow: false, saver: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<NetworkState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

const fromNetInfo = (s: NetInfoState) => {
  const online = !!s.isConnected && s.isInternetReachable !== false;
  const gen = s.type === 'cellular' ? s.details?.cellularGeneration : null;
  set({ online, slow: gen === '2g' || gen === '3g' });
  onlineManager.setOnline(online);
};

let started = false;
/** À appeler une fois au démarrage (app/_layout.tsx). */
export function startNetworkWatch() {
  if (started) return;
  started = true;
  NetInfo.addEventListener(fromNetInfo);
  void NetInfo.fetch().then(fromNetInfo);
  AsyncStorage.getItem(SAVER_KEY)
    .then((v) => set({ saver: v === '1' }))
    .catch(() => undefined);
}

export function setDataSaver(on: boolean) {
  set({ saver: on });
  void AsyncStorage.setItem(SAVER_KEY, on ? '1' : '0').catch(() => undefined);
}

/** Mode léger : économie de données choisie, ou réseau lent (2G/3G). */
export const isLightMode = () => state.saver || state.slow;
export const isOnline = () => state.online;

export function useNetwork(): NetworkState & { light: boolean } {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  return { ...s, light: s.saver || s.slow };
}
