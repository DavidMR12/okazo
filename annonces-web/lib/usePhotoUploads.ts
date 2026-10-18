'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClientError } from './client';
import { compressImage, createLimiter, PhotoError, uploadPhoto } from './upload';

export type PhotoStatus = 'processing' | 'uploading' | 'done' | 'error';
// file absent : photo déjà en ligne (modification d'annonce)
export interface Photo { id: string; file?: File; preview: string; status: PhotoStatus; key?: string; error?: string }

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
let seq = 0;

/** Les photos partent dès leur ajout, pendant que le vendeur remplit le formulaire. */
export function usePhotoUploads(max = 8) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const ref = useRef<Photo[]>([]);
  // eslint-disable-next-line react-hooks/refs -- dernière liste de photos, lue par les envois en cours
  ref.current = photos;
  const alive = useRef(new Set<string>());
  const limiter = useRef(createLimiter(2)).current;

  // Libère la mémoire des aperçus en quittant la page
  useEffect(() => () => ref.current.forEach((p) => p.file && URL.revokeObjectURL(p.preview)), []);

  const patch = useCallback((id: string, p: Partial<Photo>) => {
    if (!alive.current.has(id)) return;
    setPhotos((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }, []);

  const run = useCallback(
    (photo: Photo) => {
      patch(photo.id, { status: 'processing', error: undefined });
      void limiter(async () => {
        if (!alive.current.has(photo.id) || !photo.file) return;
        try {
          const blob = await compressImage(photo.file);
          patch(photo.id, { status: 'uploading' });
          const key = await uploadPhoto(blob);
          patch(photo.id, { status: 'done', key });
        } catch (e) {
          const msg = e instanceof PhotoError || e instanceof ClientError ? e.message : 'Envoi impossible.';
          patch(photo.id, { status: 'error', error: msg });
        }
      });
    },
    [limiter, patch],
  );

  /** Renvoie un message si des fichiers ont été ignorés. */
  const add = useCallback(
    (files: FileList | File[]): string | null => {
      const list = Array.from(files);
      const images = list.filter((f) => ACCEPTED.includes(f.type));
      const room = Math.max(max - ref.current.length, 0);
      const kept = images.slice(0, room);
      const fresh: Photo[] = kept.map((file) => ({ id: `p${++seq}`, file, preview: URL.createObjectURL(file), status: 'processing' }));
      fresh.forEach((p) => alive.current.add(p.id));
      setPhotos((ps) => [...ps, ...fresh]);
      fresh.forEach(run);
      if (images.length < list.length) return 'Certains fichiers ont été ignorés : seules les photos JPEG, PNG et WebP sont acceptées.';
      if (kept.length < images.length) return `${max} photos maximum.`;
      return null;
    },
    [max, run],
  );

  /** Photos déjà publiées : affichées telles quelles, rien à renvoyer. */
  const addExisting = useCallback((list: { key: string; url: string | null }[]) => {
    const fresh: Photo[] = list.map((p) => ({ id: `p${++seq}`, preview: p.url ?? '', status: 'done', key: p.key }));
    fresh.forEach((p) => alive.current.add(p.id));
    setPhotos(fresh);
  }, []);

  const remove = useCallback((id: string) => {
    alive.current.delete(id);
    setPhotos((ps) => {
      const p = ps.find((x) => x.id === id);
      if (p?.file) URL.revokeObjectURL(p.preview);
      return ps.filter((x) => x.id !== id);
    });
  }, []);

  const retry = useCallback((id: string) => {
    const p = ref.current.find((x) => x.id === id);
    if (p?.file) run(p);
  }, [run]);

  const makeCover = useCallback((id: string) => {
    setPhotos((ps) => {
      const p = ps.find((x) => x.id === id);
      return p ? [p, ...ps.filter((x) => x.id !== id)] : ps;
    });
  }, []);

  const reset = useCallback(() => {
    ref.current.forEach((p) => p.file && URL.revokeObjectURL(p.preview));
    alive.current.clear();
    setPhotos([]);
  }, []);

  return useMemo(() => {
    const done = photos.filter((p) => p.status === 'done').length;
    return {
      photos, add, addExisting, remove, retry, makeCover, reset,
      remaining: max - photos.length,
      done,
      hasErrors: photos.some((p) => p.status === 'error'),
      ready: photos.length > 0 && done === photos.length,
      keys: photos.filter((p) => p.key).map((p) => p.key!),
    };
  }, [photos, add, addExisting, remove, retry, makeCover, reset, max]);
}
