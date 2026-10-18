'use client';

import { call } from './client';

const MAX_SIDE = 1600;
const MIN_SIDE = 200; // minimum exigé par l'API
const TIMEOUT_MS = 90_000;

export class PhotoError extends Error {}

/**
 * Compression dans le navigateur avant l'envoi : une photo de téléphone de 4 Mo devient ~300-500 Ko.
 * L'orientation de l'appareil photo est appliquée, la transparence remplacée par du blanc.
 */
export async function compressImage(file: File, quality = 0.72): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('Format non pris en charge. Utilisez une photo JPEG, PNG ou WebP.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  if (Math.min(w, h) < MIN_SIDE) {
    bitmap.close();
    throw new PhotoError('Photo trop petite. Utilisez une photo plus grande.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('Traitement de la photo impossible.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new PhotoError('Traitement de la photo impossible.');
  return blob;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envoi direct au stockage (la photo ne passe pas par nos serveurs), avec 3 essais.
 * Le bucket doit autoriser les envois PUT depuis le domaine du site (règle CORS).
 */
export async function uploadPhoto(blob: Blob): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { uploads } = await call<{ uploads: { key: string; uploadUrl: string }[] }>('/media/upload-urls', {
      method: 'POST',
      body: { files: [{ contentType: 'image/jpeg', sizeBytes: blob.size }] },
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(uploads[0].uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return uploads[0].key;
    } catch (e) {
      lastError = e;
      await sleep(1500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new PhotoError(lastError instanceof PhotoError ? lastError.message : "Envoi impossible. Vérifiez votre connexion.");
}

/** Au plus `n` envois simultanés : une connexion faible n'est pas saturée. */
export function createLimiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    queue.shift()!();
  };
  return <T,>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}
