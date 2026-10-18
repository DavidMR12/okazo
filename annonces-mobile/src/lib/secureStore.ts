import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Coffre chiffré du téléphone (SecureStore). Dans un navigateur (version web d’Expo, démonstrations
 * en partage d’écran), SecureStore n’existe pas : on se rabat sur le stockage du navigateur.
 * Sur téléphone, rien ne change.
 */
const web = Platform.OS === 'web';

export async function getItemAsync(key: string): Promise<string | null> {
  if (!web) return SecureStore.getItemAsync(key);
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (!web) return SecureStore.setItemAsync(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : la session ne survivra pas au rechargement */
  }
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (!web) return SecureStore.deleteItemAsync(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignoré */
  }
}
