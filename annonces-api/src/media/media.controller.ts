import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimitService } from '../common/rate-limit.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { env } from '../config/env';
import { IMAGE_TYPES, pendingKey } from './media-keys';
import { StorageService } from './storage.service';

const uploadUrlsSchema = z.object({
  files: z
    .array(
      z.object({
        contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        sizeBytes: z.number().int().positive().max(env.MAX_IMAGE_BYTES),
      }),
    )
    .min(1)
    .max(8),
});
type UploadUrlsInput = z.infer<typeof uploadUrlsSchema>;

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /**
   * Étape 1 de la publication : le client reçoit une URL par photo et envoie chaque fichier
   * directement au stockage (PUT). Il passe ensuite les "key" à POST /listings.
   * Conseil mobile : compresser en JPEG ~1600 px avant l'envoi (≈ 300-500 Ko) pour les réseaux lents.
   */
  @Post('upload-urls')
  @HttpCode(HttpStatus.OK)
  async uploadUrls(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(uploadUrlsSchema)) body: UploadUrlsInput) {
    await this.rateLimit.hit(`rl:upload:${user.id}`, 40, 3600);

    const uploads = await Promise.all(
      body.files.map(async (f) => {
        const key = pendingKey(user.id, randomUUID(), IMAGE_TYPES[f.contentType]);
        return {
          key,
          method: 'PUT' as const,
          uploadUrl: await this.storage.presignUpload(key, f.contentType, f.sizeBytes),
          headers: { 'Content-Type': f.contentType },
        };
      }),
    );
    return { uploads, expiresInSec: 600 };
  }
}
