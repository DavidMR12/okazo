import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { api } from '../api/client';

const MAX_BYTES = 5_000_000; // limite de l’API
const PUT_TIMEOUT_MS = 90_000; // une photo sur un réseau lent peut prendre du temps

/**
 * Compression sur le téléphone avant l’envoi : une photo de 4 Mo devient ~300-500 Ko.
 * C’est le principal gain de temps et de forfait pour le vendeur.
 */
export async function compressImage(
  uri: string,
  width: number,
  height: number,
  maxSide = 1600,
  quality = 0.7,
): Promise<{ uri: string; width: number; height: number }> {
  const ctx = ImageManipulator.manipulate(uri);
  const longest = Math.max(width || 0, height || 0);
  if (!longest || longest > maxSide) {
    if ((width || 0) >= (height || 0)) ctx.resize({ width: maxSide });
    else ctx.resize({ height: maxSide });
  }
  const rendered = await ctx.renderAsync();
  const out = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height };
}

async function uriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

async function putFile(url: string, blob: Blob, contentType = 'image/jpeg'): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PUT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Envoi refusé (${res.status})`);
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface UploadUrls {
  uploads: { key: string; uploadUrl: string }[];
}

/**
 * Envoie des photos directement au stockage (elles ne passent pas par l’API).
 * En cas d’échec réseau, 3 essais avec de nouvelles URL (elles expirent après 10 min).
 */
async function uploadBatch(endpoint: string, uris: string[]): Promise<string[]> {
  const blobs = await Promise.all(uris.map(uriToBlob));
  if (blobs.some((b) => b.size > MAX_BYTES)) throw new Error('Photo trop lourde.');

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { uploads } = await api<UploadUrls>(endpoint, {
      method: 'POST',
      auth: true,
      body: { files: blobs.map((b) => ({ contentType: 'image/jpeg', sizeBytes: b.size })) },
    });
    try {
      await Promise.all(uploads.map((u, i) => putFile(u.uploadUrl, blobs[i])));
      return uploads.map((u) => u.key);
    } catch (e) {
      lastError = e;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Envoi impossible.');
}

export const uploadListingPhoto = (uri: string) => uploadBatch('/media/upload-urls', [uri]).then((keys) => keys[0]);

/** Pièce d’identité puis selfie : stockés dans un dossier privé. */
export const uploadVerificationPhotos = (documentUri: string, selfieUri: string) =>
  uploadBatch('/verifications/upload-urls', [documentUri, selfieUri]);

/** File d’attente : au plus `n` envois simultanés, pour ne pas saturer une connexion faible. */
export function createLimiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    queue.shift()!();
  };
  return <T>(task: () => Promise<T>): Promise<T> =>
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

export type CvType = 'application/pdf' | 'image/jpeg' | 'image/png';

/**
 * CV d’une candidature (PDF, ou photo du CV déjà compressée) : dossier privé, lu par le seul recruteur.
 * 3 essais avec une nouvelle URL en cas d’échec réseau.
 */
export async function uploadCv(listingId: string, uri: string, contentType: CvType): Promise<string> {
  const blob = await uriToBlob(uri);
  if (blob.size > MAX_BYTES) throw new Error('CV trop lourd (5 Mo maximum).');
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const u = await api<{ key: string; uploadUrl: string }>(`/listings/${listingId}/applications/cv-upload-url`, {
      method: 'POST',
      auth: true,
      body: { contentType, sizeBytes: blob.size },
    });
    try {
      await putFile(u.uploadUrl, blob, contentType);
      return u.key;
    } catch (e) {
      lastError = e;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Envoi impossible.');
}
