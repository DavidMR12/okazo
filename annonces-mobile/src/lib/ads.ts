/**
 * Publicité AdMob (21/11/2026). Compte AdMob du porteur, appli « Okazo » Android :
 * ID d'application ca-app-pub-7249006535506723~9793735046 (dans app.config.ts, il est public par nature).
 *
 * Démarrage : formulaire de consentement de Google (UMP) d'abord, puis initialisation du SDK, et seulement si
 * Google dit qu'on peut demander des annonces. Refus : annonces non personnalisées (géré par Google).
 * Aucune annonce dans Expo Go (module natif absent) ni sur le web.
 *
 * Blocs d'annonces : tant que les vrais identifiants ne sont pas renseignés ci-dessous, on affiche les annonces
 * de TEST de Google (mention « Test Ad ») : jamais d'annonce réelle sur un bloc inconnu, aucun risque pour le compte.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Identifiants des blocs d'annonces (AdMob > Okazo > Blocs d'annonces). Vides = annonces de test. */
const UNITS = {
  // Blocs « Okazo - Accueil » et « Okazo - Fiche annonce », créés le 21/11/2026
  android: { home: 'ca-app-pub-7249006535506723/3602685038', listing: 'ca-app-pub-7249006535506723/9377755890' },
  ios: { home: '', listing: '' },
};

/**
 * Affichage des bannières. false pendant les tests (21/11/2026, demande du porteur) : AdMob reste branché et
 * initialisé (consentement, SDK), mais aucune bannière n'apparaît, pour qu'aucun testeur ne clique sur une annonce
 * (Google sanctionne les clics de l'entourage). Passer à true pour la sortie publique, puis nouvelle version.
 */
export const SHOW_ADS = false;

export type AdPlacement = 'home' | 'listing';

type AdsModule = typeof import('react-native-google-mobile-ads');

let mod: AdsModule | null | undefined;
/** Le module natif, ou null là où il n'existe pas (Expo Go, web). */
export function adsModule(): AdsModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web' || Constants.appOwnership === 'expo') return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('react-native-google-mobile-ads') as AdsModule;
  } catch {
    mod = null;
  }
  return mod;
}

let ready = false;
const listeners = new Set<() => void>();
export const adsReady = () => ready;
export function onAdsReady(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

let started = false;
/** À appeler une fois au démarrage. Ne lève jamais d'erreur : sans publicité, l'appli marche pareil. */
export async function startAds() {
  if (started) return;
  started = true;
  const ads = adsModule();
  if (!ads) return;
  try {
    const consent = await ads.AdsConsent.gatherConsent().catch(() => null);
    if (consent && !consent.canRequestAds) return;
    await ads.default().initialize();
    ready = true;
    listeners.forEach((fn) => fn());
  } catch {
    // Publicité indisponible : on continue sans
  }
}

export function adUnitId(placement: AdPlacement): string | null {
  const ads = adsModule();
  if (!ads || !SHOW_ADS) return null;
  const id = UNITS[Platform.OS === 'ios' ? 'ios' : 'android'][placement];
  return id || ads.TestIds.ADAPTIVE_BANNER;
}
