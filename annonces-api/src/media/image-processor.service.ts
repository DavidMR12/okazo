import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { sha256 } from '../common/crypto';

export class ImageError extends Error {
  constructor(public readonly code: 'IMAGE_UNREADABLE' | 'IMAGE_FORMAT' | 'IMAGE_TOO_SMALL') {
    super(code);
  }
}

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  sha256: string;
  phash: string | null; // 64 caractères '0'/'1'
}

const MAX_PIXELS = 40_000_000;
const MIN_SIDE = 200;

@Injectable()
export class ImageProcessorService {
  async process(original: Buffer): Promise<ProcessedImage> {
    let format: string | undefined;
    let width = 0;
    let height = 0;
    try {
      const meta = await sharp(original, { limitInputPixels: MAX_PIXELS }).metadata();
      format = meta.format;
      width = meta.width ?? 0;
      height = meta.height ?? 0;
    } catch {
      throw new ImageError('IMAGE_UNREADABLE');
    }
    if (!format || !['jpeg', 'png', 'webp'].includes(format)) throw new ImageError('IMAGE_FORMAT');
    if (Math.min(width, height) < MIN_SIDE) throw new ImageError('IMAGE_TOO_SMALL');

    try {
      // rotate() applique l'orientation EXIF ; sharp supprime ensuite toutes les métadonnées
      // (position GPS, modèle de téléphone…) : protection de la vie privée des vendeurs.
      const base = sharp(original, { limitInputPixels: MAX_PIXELS }).rotate();
      const [full, thumb, phash] = await Promise.all([
        base
          .clone()
          .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer({ resolveWithObject: true }),
        base.clone().resize({ width: 400, height: 400, fit: 'cover' }).webp({ quality: 70 }).toBuffer(),
        this.dhash(original),
      ]);
      return {
        full: full.data,
        thumb,
        width: full.info.width,
        height: full.info.height,
        sha256: sha256(original),
        phash,
      };
    } catch {
      throw new ImageError('IMAGE_UNREADABLE');
    }
  }

  /**
   * Empreinte perceptuelle "dHash" (64 bits) : robuste à la recompression et au redimensionnement.
   * Deux photos quasi identiques ont des empreintes à distance de Hamming très faible.
   */
  private async dhash(original: Buffer): Promise<string | null> {
    const { data, info } = await sharp(original, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .flatten({ background: '#ffffff' })
      .grayscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let bits = '';
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = data[(y * 9 + x) * info.channels];
        const right = data[(y * 9 + x + 1) * info.channels];
        bits += left > right ? '1' : '0';
      }
    }
    // Image unie (tout blanc, tout noir…) : empreinte sans valeur, on l'ignore
    return /^(0+|1+)$/.test(bits) ? null : bits;
  }
}
