import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { env } from '../config/env';
import { ImageError } from './image-processor.service';

export const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';
const MAX_PIXELS = 40_000_000;

type Embedder = (raw: Uint8ClampedArray, width: number, height: number) => Promise<number[]>;

/** Charge CLIP (une seule fois, à la première photo). En production, le modèle est déjà dans l'image Docker. */
export async function loadClip(): Promise<Embedder> {
  const { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env: hf } = await import('@huggingface/transformers');
  hf.cacheDir = env.MODEL_CACHE_DIR;
  hf.allowRemoteModels = env.NODE_ENV !== 'production';
  const processor = await AutoProcessor.from_pretrained(CLIP_MODEL);
  const model = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: 'q8' });
  return async (raw, width, height) => {
    const { image_embeds } = await model(await processor(new RawImage(raw, width, height, 3)));
    const vector = Array.from(image_embeds.data as Float32Array);
    const norm = Math.hypot(...vector) || 1;
    return vector.map((x) => x / norm);
  };
}

/**
 * Recherche par image (comme Google Lens) : CLIP transforme une photo en « empreinte » de 512 nombres ; deux photos
 * d'objets semblables ont des empreintes proches. Le modèle tourne sur notre serveur : aucune photo ne part chez un
 * tiers, et il n'y a ni clé ni coût par recherche.
 */
@Injectable()
export class VisualSearchService {
  private readonly log = new Logger(VisualSearchService.name);
  private clip: Promise<Embedder> | null = null;

  get enabled(): boolean {
    return env.VISUAL_SEARCH_ENABLED;
  }

  /** Empreinte au format attendu par pgvector (« [0.1,0.2,…] »). */
  async embed(image: Buffer): Promise<string> {
    let decoded;
    try {
      const { format } = await sharp(image, { limitInputPixels: MAX_PIXELS }).metadata();
      if (!format || !['jpeg', 'png', 'webp'].includes(format)) throw new ImageError('IMAGE_FORMAT');
      decoded = await sharp(image, { limitInputPixels: MAX_PIXELS })
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize({ width: 336, height: 336, fit: 'inside', withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    } catch (err) {
      throw err instanceof ImageError ? err : new ImageError('IMAGE_UNREADABLE');
    }
    this.clip ??= loadClip().catch((err) => {
      this.clip = null; // nouvel essai à la prochaine photo
      throw err;
    });
    const embedder = await this.clip;
    const vector = await embedder(new Uint8ClampedArray(decoded.data), decoded.info.width, decoded.info.height);
    return `[${vector.map((x) => x.toFixed(6)).join(',')}]`;
  }

  /** À la modération : une empreinte manquante ne doit jamais bloquer la publication d'une annonce. */
  async tryEmbed(image: Buffer): Promise<string | null> {
    if (!this.enabled) return null;
    return this.embed(image).catch((err) => {
      this.log.warn(`Empreinte de photo impossible : ${err}`);
      return null;
    });
  }
}
