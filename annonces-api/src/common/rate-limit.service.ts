import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

// INCR + EXPIRE en une seule opération atomique.
const SCRIPT = `
local c = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if c == 1 or ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {c, ttl}
`;

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async consume(key: string, windowSec: number): Promise<{ count: number; ttlSec: number }> {
    const [count, ttl] = (await this.redis.eval(SCRIPT, 1, key, windowSec)) as [number, number];
    return { count, ttlSec: Math.max(ttl, 1) };
  }

  /** Compte un appel et lève une erreur 429 si la limite est dépassée. */
  async hit(key: string, limit: number, windowSec: number): Promise<void> {
    const { count, ttlSec } = await this.consume(key, windowSec);
    if (count > limit) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Trop de tentatives. Réessayez plus tard.',
          retryAfterSec: ttlSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
