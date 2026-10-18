import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { RateLimitService } from '../common/rate-limit.service';
import { env } from '../config/env';
import { REDIS } from '../redis/redis.module';
import { MAIL_PROVIDER, MailProvider } from './mail/mail-provider';

export type EmailCodePurpose = 'register' | 'reset';

const TTL_SEC = 15 * 60; // un e-mail met parfois plusieurs minutes à arriver
const RESEND_COOLDOWN_SEC = 60;
const MAX_ATTEMPTS = 5;

/**
 * Codes à 6 chiffres envoyés par e-mail : confirmer l'adresse à l'inscription, ou réinitialiser
 * le mot de passe. Mêmes règles que les codes SMS : haché dans Redis, 5 essais, usage unique, limites d'envoi.
 */
@Injectable()
export class EmailCodeService {
  private readonly log = new Logger(EmailCodeService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    private readonly rateLimit: RateLimitService,
  ) {}

  get enabled(): boolean {
    return this.mail.enabled;
  }

  async send(purpose: EmailCodePurpose, email: string, ip: string): Promise<{ expiresInSec: number; resendAfterSec: number }> {
    if (!this.mail.enabled) {
      throw new BadRequestException({ code: 'EMAIL_UNAVAILABLE', message: 'La connexion par e-mail n’est pas disponible pour le moment.' });
    }
    await this.rateLimit.hit(`rl:mail:cooldown:${purpose}:${email}`, 1, RESEND_COOLDOWN_SEC);
    await this.rateLimit.hit(`rl:mail:addr:${email}`, 5, 3600);
    await this.rateLimit.hit(`rl:mail:ip:${ip}`, 20, 3600);

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const key = `ecode:${purpose}:${email}`;
    await this.redis.multi().set(key, this.hash(purpose, email, code), 'EX', TTL_SEC).del(`${key}:attempts`).exec();

    const minutes = Math.floor(TTL_SEC / 60);
    const [subject, text] =
      purpose === 'register'
        ? [`${env.APP_NAME} : confirmez votre adresse`, `Votre code de confirmation ${env.APP_NAME} est ${code}. Il expire dans ${minutes} min. Si vous n’avez rien demandé, ignorez ce message.`]
        : [`${env.APP_NAME} : nouveau mot de passe`, `Votre code pour choisir un nouveau mot de passe ${env.APP_NAME} est ${code}. Il expire dans ${minutes} min. Si vous n’avez rien demandé, ignorez ce message : votre mot de passe ne change pas.`];
    try {
      await this.mail.send(email, subject, text);
    } catch (err) {
      this.log.error(`Échec d'envoi d'e-mail : ${(err as Error).message}`);
      await this.redis.del(key);
      throw new ServiceUnavailableException({ code: 'EMAIL_SEND_FAILED', message: 'Impossible d’envoyer l’e-mail pour le moment. Réessayez plus tard.' });
    }
    return { expiresInSec: TTL_SEC, resendAfterSec: RESEND_COOLDOWN_SEC };
  }

  async verify(purpose: EmailCodePurpose, email: string, code: string): Promise<void> {
    const key = `ecode:${purpose}:${email}`;
    const stored = await this.redis.get(key);
    if (!stored) throw new BadRequestException({ code: 'CODE_EXPIRED', message: 'Code expiré. Demandez-en un nouveau.' });

    const attempts = await this.redis.incr(`${key}:attempts`);
    if (attempts === 1) await this.redis.expire(`${key}:attempts`, TTL_SEC);
    if (attempts > MAX_ATTEMPTS) {
      await this.redis.del(key, `${key}:attempts`);
      throw new HttpException({ code: 'TOO_MANY_ATTEMPTS', message: 'Trop d’essais. Demandez un nouveau code.' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const given = Buffer.from(this.hash(purpose, email, code));
    const expected = Buffer.from(stored);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Code incorrect.' });
    }
    // Usage unique
    if ((await this.redis.del(key, `${key}:attempts`)) === 0) {
      throw new BadRequestException({ code: 'CODE_EXPIRED', message: 'Code expiré. Demandez-en un nouveau.' });
    }
  }

  private hash(purpose: EmailCodePurpose, email: string, code: string): string {
    return createHmac('sha256', env.OTP_SECRET).update(`mail:${purpose}:${email}:${code}`).digest('hex');
  }
}
