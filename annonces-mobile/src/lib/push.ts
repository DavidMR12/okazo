import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { api } from '../api/client';
import { dialog } from '../components/Dialog';

/**
 * Notifications push (22/11/2026), par Firebase comme LocAr : le téléphone donne son jeton Firebase (FCM),
 * l'API l'enregistre (/me/push-tokens) et envoie elle-même : nouveau message, offre, annonce en ligne ou refusée.
 * Rien dans Expo Go (push indisponible depuis le SDK 53) ni sur le web. Sans google-services.json dans la
 * construction, le jeton n'est pas obtenu : l'appli marche pareil, sans notifications.
 */
type Notifs = typeof import('expo-notifications');

let mod: Notifs | null | undefined;
function notifications(): Notifs | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web' || Constants.appOwnership === 'expo') return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as Notifs;
  } catch {
    mod = null;
  }
  return mod;
}

const ASKED_KEY = 'push-asked-at';
const ASK_AGAIN_MS = 30 * 24 * 3600 * 1000; // « Plus tard » : on redemande au bout de 30 jours
/** Écrans qu'une notification peut ouvrir : jamais une adresse arbitraire. */
const ALLOWED = /^\/(conversation\/[0-9a-f-]{36}|listing\/[0-9a-f-]{36}|my-listings)$/;

let token: string | null = null;
let tokenSub: { remove(): void } | null = null;

function open(data: unknown) {
  const d = (data ?? {}) as Record<string, unknown>;
  const url = typeof d.url === 'string' ? d.url : null;
  if (url && ALLOWED.test(url)) router.push(url as never);
}

let ready: Promise<void> | null = null;
/** Une fois au démarrage : affichage au premier plan, canal Android, ouverture de l'écran au toucher. */
export function setupPush() {
  const N = notifications();
  if (!N || ready) return;
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  N.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
  ready = (async () => {
    // Le canal doit exister avant la demande d'autorisation (Android 13) et avant le jeton
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', { name: 'Messages et annonces', importance: N.AndroidImportance.HIGH });
    }
    // Appli ouverte en touchant une notification alors qu'elle était fermée
    const last = await N.getLastNotificationResponseAsync();
    if (last) {
      await N.clearLastNotificationResponseAsync();
      setTimeout(() => open(last.notification.request.content.data), 300);
    }
  })().catch(() => undefined);
}

const askFirst = () =>
  new Promise<boolean>((resolve) =>
    dialog(
      'Être prévenu',
      'Recevez une notification quand un acheteur vous écrit, quand vous recevez une offre ou quand votre annonce est en ligne.',
      [
        { text: 'Plus tard', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Activer', onPress: () => resolve(true) },
      ],
    ),
  );

async function send(value: string) {
  token = value;
  await api('/me/push-tokens', { method: 'POST', body: { token: value, platform: Platform.OS === 'ios' ? 'ios' : 'android' } }).catch(() => undefined);
}

/** Après la connexion (et à chaque ouverture connectée) : autorisation expliquée d'abord, puis jeton envoyé à l'API. */
export async function registerPush() {
  const N = notifications();
  if (!N) return;
  try {
    setupPush();
    await ready;
    let perm = await N.getPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) return; // refus définitif : réglages du téléphone seulement
      const asked = Number((await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) ?? 0);
      if (Date.now() - asked < ASK_AGAIN_MS) return;
      await AsyncStorage.setItem(ASKED_KEY, String(Date.now())).catch(() => undefined);
      if (!(await askFirst())) return;
      perm = await N.requestPermissionsAsync();
      if (!perm.granted) return;
    }
    const t = await N.getDevicePushTokenAsync();
    if (typeof t.data !== 'string') return;
    await send(t.data);
    // Le jeton peut changer pendant que l'appli tourne : l'ancien ne marche plus
    tokenSub ??= N.addPushTokenListener((n) => {
      if (typeof n.data === 'string' && n.data !== token) void send(n.data);
    });
  } catch {
    // Pas de Firebase dans cette construction, ou service indisponible : sans notifications
  }
}

/** Avant la déconnexion : ce téléphone ne reçoit plus les notifications du compte. */
export async function unregisterPush() {
  tokenSub?.remove();
  tokenSub = null;
  if (!token) return;
  const t = token;
  token = null;
  await api('/me/push-tokens/remove', { method: 'POST', body: { token: t } }).catch(() => undefined);
}
