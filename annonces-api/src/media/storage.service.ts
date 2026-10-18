import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { env } from '../config/env';

/**
 * Deux buckets : « listings/ » (photos modérées) dans le bucket public, tout le reste
 * (« pending/ », « verifications/ ») dans le bucket privé. Une erreur de configuration du bucket
 * public ne peut donc jamais exposer une pièce d'identité.
 */
const bucketFor = (key: string) => (key.startsWith('listings/') ? env.S3_BUCKET : env.S3_PRIVATE_BUCKET ?? env.S3_BUCKET);

@Injectable()
export class StorageService {
  private readonly s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    // Sans cela, les SDK récents ajoutent une somme de contrôle que R2/MinIO et les navigateurs gèrent mal.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  /** URL d'envoi direct (PUT) : la photo ne transite pas par l'API. */
  presignUpload(key: string, contentType: string, sizeBytes: number, expiresInSec = 600): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: bucketFor(key), Key: key, ContentType: contentType, ContentLength: sizeBytes }),
      { expiresIn: expiresInSec, signableHeaders: new Set(['content-type', 'content-length']) },
    );
  }

  /** Lien de lecture temporaire pour un fichier privé (pièces d'identité, vues par les modérateurs). */
  presignDownload(key: string, expiresInSec = 300): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: bucketFor(key), Key: key }), { expiresIn: expiresInSec });
  }

  async head(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: bucketFor(key), Key: key }));
      return { size: r.ContentLength ?? 0, contentType: r.ContentType };
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async getBuffer(key: string): Promise<Buffer> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: bucketFor(key), Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async putBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucketFor(key),
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable', // fichiers jamais modifiés : cache CDN longue durée
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: bucketFor(key), Key: key }));
  }

  publicUrl(key: string): string {
    return `${env.MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${key}`;
  }
}
