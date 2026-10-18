import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthedRequest, Role } from '../auth.types';
import { ROLES_KEY } from './roles.decorator';

/**
 * À utiliser APRÈS JwtAuthGuard : @UseGuards(JwtAuthGuard, RolesGuard)
 * Le rôle vient du jeton (valable 15 min) : un retrait de rôle prend effet à l'expiration.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user || !required.includes(req.user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Accès refusé.' });
    }
    return true;
  }
}
