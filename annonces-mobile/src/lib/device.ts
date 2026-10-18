import * as Application from 'expo-application';
import * as SecureStore from './secureStore';
import { Platform } from 'react-native';

const INSTALL_ID_KEY = 'app.installId';

/**
 * Identifiant d’appareil envoyé à la connexion (l’API le hache) : il sert à repérer
 * les comptes multiples et à bloquer l’appareil d’un fraudeur banni.
 */
export async function deviceFingerprint(): Promise<{ fingerprint: string; platform: 'ios' | 'android' }> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  let id: string | null = null;
  try {
    id = platform === 'android' ? Application.getAndroidId() : await Application.getIosIdForVendorAsync();
  } catch {
    id = null;
  }
  if (!id) {
    id = await SecureStore.getItemAsync(INSTALL_ID_KEY);
    if (!id) {
      id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      await SecureStore.setItemAsync(INSTALL_ID_KEY, id);
    }
  }
  return { fingerprint: `${platform}:${id}`, platform };
}
