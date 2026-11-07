import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { RateLimitService } from '../common/rate-limit.service';
import { Database, DB } from '../db/db.module';
import { cities, listings, users } from '../db/schema';
import { assertAcceptableName } from './display-name';
import { UpdateProfileInput } from './users.schemas';

const NAME_CHANGES_PER_30_DAYS = 3;

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rateLimit: RateLimitService,
  ) {}

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const [current] = await this.db
      .select({ displayName: users.displayName, cityId: users.cityId, countryCode: users.countryCode, status: users.status, contactPreference: users.contactPreference })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!current) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });

    const patch: { displayName?: string; cityId?: number | null; contactPreference?: 'all' | 'messages_only' } = {};
    if (input.contactPreference !== undefined) patch.contactPreference = input.contactPreference;

    if (input.displayName !== undefined && input.displayName !== current.displayName) {
      assertAcceptableName(input.displayName);
      // Changer souvent de nom est un signe d'usurpation : 3 changements par 30 jours
      await this.rateLimit.hit(`rl:rename:${userId}`, NAME_CHANGES_PER_30_DAYS, 30 * 86400);
      patch.displayName = input.displayName;
    }

    if (input.cityId !== undefined && input.cityId !== current.cityId) {
      if (input.cityId !== null) {
        const [city] = await this.db
          .select({ id: cities.id })
          .from(cities)
          .where(and(eq(cities.id, input.cityId), eq(cities.countryCode, current.countryCode), eq(cities.isActive, true)))
          .limit(1);
        if (!city) throw new BadRequestException({ code: 'CITY_INVALID', message: 'Ville invalide pour votre pays.' });
      }
      patch.cityId = input.cityId;
    }

    if (Object.keys(patch).length) await this.db.update(users).set(patch).where(eq(users.id, userId));
    return {
      displayName: patch.displayName ?? current.displayName,
      cityId: patch.cityId !== undefined ? patch.cityId : current.cityId,
      contactPreference: patch.contactPreference ?? current.contactPreference,
    };
  }

  /** Profil public du vendeur : jamais le téléphone, ni le score de confiance. */
  async publicProfile(userId: string) {
    const [row] = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        verificationLevel: users.verificationLevel,
        countryCode: users.countryCode,
        memberSince: users.createdAt,
        ratingAvg: users.ratingAvg,
        ratingCount: users.ratingCount,
        city: cities.name,
        activeListings: sql<number>`(select count(*)::int from ${listings} l
          where l.user_id = ${users.id} and l.status = 'active' and l.expires_at > now())`,
        soldListings: sql<number>`(select count(*)::int from ${listings} l where l.user_id = ${users.id} and l.status = 'sold')`,
      })
      .from(users)
      .leftJoin(cities, eq(cities.id, users.cityId))
      .where(and(eq(users.id, userId), eq(users.status, 'active')))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });
    return { ...row, activeListings: Number(row.activeListings), soldListings: Number(row.soldListings) };
  }
}
