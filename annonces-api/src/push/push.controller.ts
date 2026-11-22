import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimitService } from '../common/rate-limit.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PUSH_TOKEN, PushService } from './push.service';

const tokenSchema = z.object({
  token: z.string().regex(PUSH_TOKEN, 'Jeton de notification invalide.'),
  platform: z.enum(['android', 'ios']),
});
type TokenInput = z.infer<typeof tokenSchema>;
const removeSchema = z.object({ token: z.string().regex(PUSH_TOKEN, 'Jeton de notification invalide.') });
type RemoveInput = z.infer<typeof removeSchema>;

/** Jetons de notification du téléphone : enregistrés à la connexion, retirés à la déconnexion. */
@Controller('me/push-tokens')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly limits: RateLimitService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(tokenSchema)) body: TokenInput) {
    await this.limits.hit(`rl:push-token:${user.id}`, 30, 86400);
    await this.push.register(user.id, body.token, body.platform);
  }

  @Post('remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(removeSchema)) body: RemoveInput) {
    await this.push.unregister(user.id, body.token);
  }
}
