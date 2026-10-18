import { useCallback, useMemo, useRef, useState } from 'react';
import { isLightMode } from '../lib/network';
import { compressImage, createLimiter, uploadListingPhoto } from '../lib/upload';

export type PhotoStatus = 'processing' | 'uploading' | 'done' | 'error';

export interface Photo {
  id: string;
  uri: string; // aperçu (compressé dès que disponible)
  status: PhotoStatus;
  key?: string; // clé de stockage renvoyée par l’API, à passer dans POST /listings
  error?: string;
  source?: { uri: string; width: number; height: number }; // absent pour une photo déjà en ligne
}

let counter = 0;
const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * Les photos partent dès qu’elles sont choisies, pendant que le vendeur remplit le formulaire :
 * au moment de publier, l’envoi est déjà terminé.
 */
export function usePhotoUploads(max = 8) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const photosRef = useRef<Photo[]>([]);
  photosRef.current = photos;
  const alive = useRef(new Set<string>()); // photos encore présentes (une photo retirée ignore son envoi en cours)
  const limiter = useRef(createLimiter(2)).current;

  const patch = useCallback((id: string, p: Partial<Photo>) => {
    if (!alive.current.has(id)) return;
    setPhotos((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }, []);

  const run = useCallback(
    (photo: Photo) => {
      patch(photo.id, { status: 'processing', error: undefined });
      void limiter(async () => {
        if (!alive.current.has(photo.id) || !photo.source) return;
        try {
          // Mode léger (2G/3G ou économie de données) : photos un peu plus petites, envoi plus rapide
          const light = isLightMode();
          const c = await compressImage(photo.source.uri, photo.source.width, photo.source.height, light ? 1280 : 1600, light ? 0.6 : 0.7);
          patch(photo.id, { uri: c.uri, status: 'uploading' });
          const key = await uploadListingPhoto(c.uri);
          patch(photo.id, { status: 'done', key });
        } catch (e) {
          patch(photo.id, { status: 'error', error: e instanceof Error ? e.message : 'Envoi impossible.' });
        }
      });
    },
    [limiter, patch],
  );

  const add = useCallback(
    (assets: { uri: string; width: number; height: number }[]) => {
      const room = max - photosRef.current.length;
      const fresh: Photo[] = assets.slice(0, Math.max(room, 0)).map((a) => ({ id: newId(), uri: a.uri, status: 'processing', source: a }));
      fresh.forEach((p) => alive.current.add(p.id));
      setPhotos((ps) => [...ps, ...fresh]);
      fresh.forEach(run);
    },
    [max, run],
  );

  /** Photos déjà publiées (modification d’annonce) : affichées telles quelles, rien à renvoyer. */
  const addExisting = useCallback((list: { key: string; url: string | null }[]) => {
    const fresh: Photo[] = list.map((p) => ({ id: newId(), uri: p.url ?? '', status: 'done', key: p.key }));
    fresh.forEach((p) => alive.current.add(p.id));
    setPhotos(fresh);
  }, []);

  const remove = useCallback((id: string) => {
    alive.current.delete(id);
    setPhotos((ps) => ps.filter((p) => p.id !== id));
  }, []);

  const retry = useCallback(
    (id: string) => {
      const p = photosRef.current.find((x) => x.id === id);
      if (p?.source) run(p);
    },
    [run],
  );

  const makeCover = useCallback((id: string) => {
    setPhotos((ps) => {
      const p = ps.find((x) => x.id === id);
      return p ? [p, ...ps.filter((x) => x.id !== id)] : ps;
    });
  }, []);

  const reset = useCallback(() => {
    alive.current.clear();
    setPhotos([]);
  }, []);

  return useMemo(() => {
    const done = photos.filter((p) => p.status === 'done').length;
    return {
      photos,
      add,
      addExisting,
      remove,
      retry,
      makeCover,
      reset,
      remaining: max - photos.length,
      done,
      hasErrors: photos.some((p) => p.status === 'error'),
      ready: photos.length > 0 && done === photos.length,
      keys: photos.filter((p) => p.key).map((p) => p.key!),
    };
  }, [photos, add, addExisting, remove, retry, makeCover, reset, max]);
}
