import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
import { dialog } from '../components/Dialog';

/**
 * Accès à l'appareil photo ou aux photos, expliqué en français AVANT la demande du système (demande du porteur,
 * 20 octobre 2026 : aucun texte en anglais). La fenêtre du système suit ensuite la langue du téléphone ; dans
 * l'application publiée, son texte est celui de app.config.ts (en français).
 * Refus définitif : on propose d'ouvrir les réglages du téléphone.
 */
const ask = (title: string, message: string, accept: string) =>
  new Promise<boolean>((resolve) =>
    dialog(title, message, [
      { text: 'Plus tard', style: 'cancel', onPress: () => resolve(false) },
      { text: accept, onPress: () => resolve(true) },
    ]),
  );

async function ensure(
  get: () => Promise<ImagePicker.PermissionResponse>,
  request: () => Promise<ImagePicker.PermissionResponse>,
  texts: { title: string; why: string; denied: string },
): Promise<boolean> {
  const current = await get();
  if (current.granted) return true;
  if (!current.canAskAgain) {
    if (await ask(texts.title, texts.denied, 'Ouvrir les réglages')) void Linking.openSettings();
    return false;
  }
  if (!(await ask(texts.title, texts.why, 'Continuer'))) return false;
  const res = await request();
  if (!res.granted && !res.canAskAgain) {
    if (await ask(texts.title, texts.denied, 'Ouvrir les réglages')) void Linking.openSettings();
  }
  return res.granted;
}

export const ensureCamera = (why = 'Okazo a besoin de l’appareil photo pour photographier vos articles.') =>
  ensure(ImagePicker.getCameraPermissionsAsync, ImagePicker.requestCameraPermissionsAsync, {
    title: 'Appareil photo',
    why: `${why} Votre téléphone va vous demander l’autorisation.`,
    denied: 'L’accès à l’appareil photo est refusé. Vous pouvez l’autoriser dans les réglages du téléphone, rubrique Okazo.',
  });

export const ensurePhotos = (why = 'Okazo a besoin d’accéder à vos photos pour les ajouter à votre annonce.') =>
  ensure(() => ImagePicker.getMediaLibraryPermissionsAsync(), () => ImagePicker.requestMediaLibraryPermissionsAsync(), {
    title: 'Vos photos',
    why: `${why} Votre téléphone va vous demander l’autorisation.`,
    denied: 'L’accès à vos photos est refusé. Vous pouvez l’autoriser dans les réglages du téléphone, rubrique Okazo.',
  });
