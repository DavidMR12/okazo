import { CanActivate, ExecutionContext, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';
import { AccessTokenPayload, AuthedRequest } from '../auth.types';
import { TokenService } from '../token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly log = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly tokens: TokenService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'MISSING_TOKEN', message: 'Connexion requise.' });
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.tokens.verifyAccessToken(header.slice(7));
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Session expirée.' });
    }

    // Compte banni pendant la validité de son jeton (clé posée par SanctionsService).
    // Si Redis est indisponible, on laisse passer : les règles SQL bloquent de toute façon les actions d'un banni.
    const revoked = await this.redis.exists(`revoked-user:${payload.sub}`).catch((e) => {
      this.log.warn(`Vérification de révocation impossible : ${e}`);
      return 0;
    });
    if (revoked) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Ce compte a été désactivé.' });

    req.user = { id: payload.sub, role: payload.role };
    return true;
  }
}
