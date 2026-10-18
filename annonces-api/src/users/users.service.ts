import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { RateLimitService } from '../common/rate-limit.service';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import { cities, listings, users } from '../db/schema';
import { UpdateProfileInput } from './users.schemas';

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Noms interdits : l'usurpation du « service client » ou de l'équipe de modération est une arnaque classique
 * (« Support <marque> : payez les frais de livraison ici »). « <marque> Support », « Équipe <marque> »… sont bloqués par les mots ci-dessous.
 */
const RESERVED = [
  'admin', 'administrateur', 'administration', 'moderateur', 'moderation', 'support', 'service client',
  'assistance', 'officiel', 'official', 'staff', 'equipe', 'securite', 'verification',
];

/**
 * Nom de la marque (APP_NAME) : interdit SEUL, car un compte portant ce nom passerait pour officiel.
 * Autorisé dans un nom complet, car une marque peut aussi être un nom de famille (« Jean Laba » doit pouvoir s'inscrire).
 */
const BRAND_EXACT = [normalize(env.APP_NAME)];

const NAME_CHANGES_PER_30_DAYS = 3;

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rateLimit: RateLimitService,
  ) {}

  private assertAcceptableName(name: string) {
    const n = normalize(name);
    const digits = (name.match(/\d/g) ?? []).length;
    // Un numéro de téléphone dans le nom sert à contourner les limites de consultation des contacts
    if (digits > 4) throw new BadRequestException({ code: 'NAME_HAS_PHONE', message: 'Le nom ne doit pas contenir de numéro.' });
    if (BRAND_EXACT.includes(n) || RESERVED.some((r) => n === r || n.startsWith(`${r} `) || n.endsWith(` ${r}`) || n.includes(` ${r} `))) {
      throw new BadRequestException({ code: 'NAME_RESERVED', message: "Ce nom n'est pas autorisé." });
    }
  }

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
      this.assertAcceptableName(input.displayName);
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
