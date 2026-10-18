import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { RateLimitService } from '../common/rate-limit.service';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import { countries } from '../db/schema';
import { REDIS } from '../redis/redis.module';
import { BlocklistService } from './blocklist.service';
import { SMS_PROVIDER, SmsProvider } from './sms/sms-provider';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp/whatsapp-provider';

const RESEND_COOLDOWN_SEC = 60;

@Injectable()
export class OtpService {
  private readonly log = new Logger(OtpService.name);
  private countriesCache: { codes: Set<string>; at: number } | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
    private readonly rateLimit: RateLimitService,
    private readonly blocklist: BlocklistService,
  ) {}

  /** Normalise en E.164 et refuse les pays non ouverts. */
  async parsePhone(raw: string): Promise<{ e164: string; country: string }> {
    const parsed = parsePhoneNumberFromString(raw);
    // Si un numéro légitime est refusé, mettre à jour libphonenumber-js (plans de numérotation).
    if (!parsed || !parsed.isValid() || !parsed.country) {
      throw new BadRequestException({ code: 'INVALID_PHONE', message: 'Numéro de téléphone invalide.' });
    }
    const active = await this.activeCountries();
    if (!active.has(parsed.country)) {
      throw new BadRequestException({
        code: 'COUNTRY_NOT_SUPPORTED',
        message: "Ce pays n'est pas encore disponible.",
      });
    }
    return { e164: parsed.number, country: parsed.country };
  }

  /** Canaux proposés aux clients (WhatsApp seulement s'il est configuré). */
  channels(): ('sms' | 'whatsapp')[] {
    return this.whatsapp.enabled ? ['sms', 'whatsapp'] : ['sms'];
  }

  async request(e164: string, ip: string, channel: 'sms' | 'whatsapp' = 'sms'): Promise<{ expiresInSec: number; resendAfterSec: number; channel: 'sms' | 'whatsapp' }> {
    if (channel === 'whatsapp' && !this.whatsapp.enabled) {
      throw new BadRequestException({ code: 'CHANNEL_UNAVAILABLE', message: 'L’envoi par WhatsApp n’est pas disponible. Recevez le code par SMS.' });
    }
    if (await this.blocklist.isBlocked('phone', e164)) {
      throw new ForbiddenException({ code: 'PHONE_BLOCKED', message: 'Ce numéro ne peut pas être utilisé.' });
    }

    // Protections contre le spam et le "SMS pumping" (fraude qui fait gonfler votre facture SMS)
    await this.rateLimit.hit(`rl:otp:cooldown:${e164}`, 1, RESEND_COOLDOWN_SEC);
    await this.rateLimit.hit(`rl:otp:phone:${e164}`, env.OTP_PHONE_HOURLY_LIMIT, 3600);
    await this.rateLimit.hit(`rl:otp:ip:${ip}`, env.OTP_IP_HOURLY_LIMIT, 3600);

    const day = new Date().toISOString().slice(0, 10);
    const { count } = await this.rateLimit.consume(`rl:otp:global:${day}`, 86400);
    if (count > env.OTP_DAILY_GLOBAL_CAP) {
      this.log.error(`Plafond quotidien de SMS dépassé (${env.OTP_DAILY_GLOBAL_CAP}) : attaque possible.`);
      throw new ServiceUnavailableException({
        code: 'SMS_TEMPORARILY_UNAVAILABLE',
        message: 'Service momentanément indisponible. Réessayez plus tard.',
      });
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis
      .multi()
      .set(`otp:${e164}`, this.hashCode(e164, code), 'EX', env.OTP_TTL_SEC)
      .del(`otp:attempts:${e164}`)
      .exec();

    try {
      if (channel === 'whatsapp') await this.whatsapp.sendCode(e164, code);
      else
        await this.sms.send(
          e164,
          `${env.APP_NAME} : votre code est ${code}. Il expire dans ${Math.floor(env.OTP_TTL_SEC / 60)} min. Ne le communiquez à personne.`,
        );
    } catch (err) {
      this.log.error(`Échec d'envoi (${channel}) : ${(err as Error).message}`);
      await this.redis.del(`otp:${e164}`);
      throw new ServiceUnavailableException(
        channel === 'whatsapp'
          ? { code: 'WHATSAPP_SEND_FAILED', message: "Impossible d'envoyer le code par WhatsApp. Recevez-le par SMS." }
          : { code: 'SMS_SEND_FAILED', message: "Impossible d'envoyer le SMS pour le moment." },
      );
    }

    return { expiresInSec: env.OTP_TTL_SEC, resendAfterSec: RESEND_COOLDOWN_SEC, channel };
  }

  async verify(e164: string, code: string): Promise<void> {
    const stored = await this.redis.get(`otp:${e164}`);
    if (!stored) {
      throw new BadRequestException({ code: 'CODE_EXPIRED', message: 'Code expiré. Demandez-en un nouveau.' });
    }

    const attempts = await this.redis.incr(`otp:attempts:${e164}`);
    if (attempts === 1) await this.redis.expire(`otp:attempts:${e164}`, env.OTP_TTL_SEC);
    if (attempts > env.OTP_MAX_ATTEMPTS) {
      await this.redis.del(`otp:${e164}`, `otp:attempts:${e164}`);
      throw new HttpException(
        { code: 'TOO_MANY_ATTEMPTS', message: 'Trop d\'essais. Demandez un nouveau code.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const given = Buffer.from(this.hashCode(e164, code));
    const expected = Buffer.from(stored);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Code incorrect.' });
    }

    // Usage unique : si deux requêtes valides arrivent en même temps, une seule passe.
    const removed = await this.redis.del(`otp:${e164}`, `otp:attempts:${e164}`);
    if (removed === 0) {
      throw new BadRequestException({ code: 'CODE_EXPIRED', message: 'Code expiré. Demandez-en un nouveau.' });
    }
  }

  private hashCode(e164: string, code: string): string {
    return createHmac('sha256', env.OTP_SECRET).update(`${e164}:${code}`).digest('hex');
  }

  activeCountryCodes(): Promise<Set<string>> {
    return this.activeCountries();
  }

  private async activeCountries(): Promise<Set<string>> {
    const now = Date.now();
    if (this.countriesCache && now - this.countriesCache.at < 60_000) return this.countriesCache.codes;
    const rows = await this.db.select({ code: countries.code }).from(countries).where(eq(countries.isActive, true));
    this.countriesCache = { codes: new Set(rows.map((r) => r.code)), at: now };
    return this.countriesCache.codes;
  }
}
