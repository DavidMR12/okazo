import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env';
import { Database, DB } from '../../db/db.module';
import { users } from '../../db/schema';
import { AuthedRequest } from '../auth.types';

/**
 * À placer APRÈS JwtAuthGuard sur les actions qui engagent (publier, contacter, écrire, faire une offre,
 * postuler, donner un avis) : il faut avoir accepté la version en vigueur des CGU (preuve en cas de litige),
 * et un compte créé avec Google ou par e-mail doit d'abord vérifier un numéro.
 * Le numéro reste la clé anti-fraude (un numéro banni ne revient pas avec un nouveau compte Google).
 */
@Injectable()
export class PhoneRequiredGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Database) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) return false;
    const [u] = await this.db.select({ phone: users.phoneE164, terms: users.termsVersion }).from(users).where(eq(users.id, req.user.id)).limit(1);
    if (u && u.terms !== env.TERMS_VERSION) {
      throw new ForbiddenException({ code: 'TERMS_REQUIRED', message: 'Acceptez les conditions d’utilisation pour continuer.' });
    }
    if (!u?.phone) {
      throw new ForbiddenException({ code: 'PHONE_REQUIRED', message: 'Vérifiez votre numéro de téléphone pour continuer. Cela protège tout le monde contre les arnaques.' });
    }
    return true;
  }
}
