import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { Database, DB } from '../../db/db.module';
import { users } from '../../db/schema';
import { AuthedRequest, Role } from '../auth.types';
import { ROLES_KEY } from './roles.decorator';

/**
 * À utiliser APRÈS JwtAuthGuard : @UseGuards(JwtAuthGuard, RolesGuard)
 * Le rôle est relu en base, pas dans le jeton : un retrait de rôle ou une suspension prend effet tout de suite.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [u] = req.user ? await this.db.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, req.user.id)).limit(1) : [];
    if (!u || u.status !== 'active' || !required.includes(u.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Accès refusé.' });
    }
    req.user.role = u.role;
    return true;
  }
}
