import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, ne, or, gt, sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { AuthUser } from '../auth/auth.types';
import { env } from '../config/env';
import { Database, DB, Tx } from '../db/db.module';
import { blocklist, devices, listings, reports, sanctions, users } from '../db/schema';
import { REDIS } from '../redis/redis.module';
import { IssueSanctionInput } from './sanctions.schemas';

/** Clé Redis vérifiée par JwtAuthGuard : coupe immédiatement l'accès d'un compte banni. */
export const revokedUserKey = (userId: string) => `revoked-user:${userId}`;

const MODERATOR_MAX_SUSPENSION_DAYS = 30;

export interface IssuedSanction {
  id: string;
  type: 'warning' | 'suspension' | 'ban';
  userId: string;
}

@Injectable()
export class SanctionsService {
  private readonly log = new Logger(SanctionsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Crée une sanction dans la transaction fournie. Le déclencheur SQL trg_apply_sanction l'applique :
   * suspension du compte, ou pour un bannissement retrait des annonces, blocage du numéro et des appareils.
   * Appeler afterCommit() une fois la transaction validée.
   */
  async issue(tx: Tx, actor: AuthUser, input: IssueSanctionInput & { relatedReportId?: string }): Promise<IssuedSanction> {
    if (input.userId === actor.id) {
      throw new ForbiddenException({ code: 'SELF_SANCTION', message: 'Vous ne pouvez pas vous sanctionner vous-même.' });
    }
    // Garde-fou contre l'abus de pouvoir : seul un administrateur peut bannir
    if (input.type === 'ban' && actor.role !== 'admin') {
      throw new ForbiddenException({ code: 'BAN_REQUIRES_ADMIN', message: 'Seul un administrateur peut bannir.' });
    }
    if (input.type === 'suspension' && actor.role !== 'admin' && (input.durationDays ?? 0) > MODERATOR_MAX_SUSPENSION_DAYS) {
      throw new ForbiddenException({
        code: 'SUSPENSION_TOO_LONG',
        message: `Un modérateur peut suspendre ${MODERATOR_MAX_SUSPENSION_DAYS} jours au maximum.`,
      });
    }

    const [target] = await tx
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, input.userId))
      .for('update')
      .limit(1);
    if (!target) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });
    if (target.role === 'admin' || (target.role === 'moderator' && actor.role !== 'admin')) {
      throw new ForbiddenException({ code: 'TARGET_PROTECTED', message: 'Ce compte ne peut pas être sanctionné par vous.' });
    }
    if (target.status === 'banned') {
      throw new ConflictException({ code: 'ALREADY_BANNED', message: 'Ce compte est déjà banni.' });
    }

    const [row] = await tx
      .insert(sanctions)
      .values({
        userId: input.userId,
        type: input.type,
        reason: input.reason,
        relatedReportId: input.relatedReportId ?? null,
        issuedBy: actor.id,
        endsAt: input.type === 'suspension' ? new Date(Date.now() + input.durationDays! * 86_400_000) : null,
      })
      .returning({ id: sanctions.id });

    return { id: row.id, type: input.type, userId: input.userId };
  }

  /** Après validation : un banni perd l'accès tout de suite, sans attendre l'expiration de son jeton (15 min). */
  async afterCommit(s: IssuedSanction): Promise<void> {
    if (s.type !== 'ban') return;
    await this.redis
      .set(revokedUserKey(s.userId), '1', 'EX', env.ACCESS_TOKEN_TTL_SEC)
      .catch((e) => this.log.error(`Révocation immédiate impossible pour ${s.userId} : ${e}`));
  }

  async issueStandalone(actor: AuthUser, input: IssueSanctionInput) {
    const issued = await this.db.transaction((tx) => this.issue(tx, actor, input));
    await this.afterCommit(issued);
    return issued;
  }

  async revoke(actor: AuthUser, sanctionId: string) {
    const s = await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(sanctions).where(eq(sanctions.id, sanctionId)).for('update');
      if (!row) throw new NotFoundException({ code: 'SANCTION_NOT_FOUND', message: 'Sanction introuvable.' });
      if (row.revokedAt) throw new ConflictException({ code: 'ALREADY_REVOKED', message: 'Sanction déjà levée.' });
      if (row.type === 'ban' && actor.role !== 'admin') {
        throw new ForbiddenException({ code: 'UNBAN_REQUIRES_ADMIN', message: 'Seul un administrateur peut lever un bannissement.' });
      }

      await tx.update(sanctions).set({ revokedAt: new Date(), revokedBy: actor.id }).where(eq(sanctions.id, row.id));

      if (row.type === 'ban') await this.unban(tx, row.userId, row.id);
      return row;
    });

    if (s.type === 'suspension') await this.db.execute(sql`select lift_expired_suspensions()`);
    if (s.type === 'ban') await this.redis.del(revokedUserKey(s.userId)).catch(() => undefined);
    return { id: s.id, revoked: true };
  }

  /** Lève un bannissement, sauf si un autre bannissement actif existe. Les annonces retirées ne sont pas restaurées. */
  private async unban(tx: Tx, userId: string, sanctionId: string) {
    const [otherBan] = await tx
      .select({ id: sanctions.id })
      .from(sanctions)
      .where(and(eq(sanctions.userId, userId), eq(sanctions.type, 'ban'), isNull(sanctions.revokedAt), ne(sanctions.id, sanctionId)))
      .limit(1);
    if (otherBan) return;

    const [activeSuspension] = await tx
      .select({ id: sanctions.id })
      .from(sanctions)
      .where(
        and(
          eq(sanctions.userId, userId),
          eq(sanctions.type, 'suspension'),
          isNull(sanctions.revokedAt),
          or(isNull(sanctions.endsAt), gt(sanctions.endsAt, new Date())),
        ),
      )
      .limit(1);

    const [user] = await tx
      .update(users)
      .set({ status: activeSuspension ? 'suspended' : 'active', trustScore: 0 })
      .where(eq(users.id, userId))
      .returning({ phone: users.phoneE164 });

    // Remarque : si un appareil était aussi utilisé par un autre compte banni, il est débloqué ici.
    const fps = (await tx.select({ fp: devices.fingerprintHash }).from(devices).where(eq(devices.userId, userId))).map((d) => d.fp);
    if (user.phone) await tx.delete(blocklist).where(and(eq(blocklist.kind, 'phone'), eq(blocklist.value, user.phone)));
    if (fps.length) await tx.delete(blocklist).where(and(eq(blocklist.kind, 'device'), inArray(blocklist.value, fps)));
    await tx.update(devices).set({ isBlocked: false }).where(eq(devices.userId, userId));
  }

  /** Recherche d'un compte par numéro (back-office). Les comptes supprimés n'ont plus de numéro. */
  async findByPhone(phone: string) {
    const [u] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneE164, phone))
      .limit(1);
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Aucun compte avec ce numéro.' });
    return u;
  }

  /** Fiche d'enquête : historique, signalements reçus, et comptes partageant un appareil (contournement de bannissement). */
  async userSummary(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });

    const [history, reportsReceived, listingStats, linked] = await Promise.all([
      this.db.select().from(sanctions).where(eq(sanctions.userId, userId)).orderBy(desc(sanctions.createdAt)).limit(50),
      this.db
        .select({ status: reports.status, n: sql<number>`count(*)::int` })
        .from(reports)
        .where(
          or(
            eq(reports.reportedUserId, userId),
            inArray(reports.listingId, this.db.select({ id: listings.id }).from(listings).where(eq(listings.userId, userId))),
          ),
        )
        .groupBy(reports.status),
      this.db
        .select({ status: listings.status, n: sql<number>`count(*)::int` })
        .from(listings)
        .where(eq(listings.userId, userId))
        .groupBy(listings.status),
      this.db.execute(sql`
        select distinct u.id, u.display_name, u.status, u.created_at
          from devices d1
          join devices d2 on d2.fingerprint_hash = d1.fingerprint_hash and d2.user_id <> d1.user_id
          join users u on u.id = d2.user_id
         where d1.user_id = ${userId}
         limit 50`) as unknown as Promise<Array<{ id: string; display_name: string; status: string; created_at: Date }>>,
    ]);

    const counts = (rows: Array<{ status: string; n: number }>) => Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
    return {
      user: {
        id: user.id,
        phone: user.phoneE164,
        displayName: user.displayName,
        countryCode: user.countryCode,
        role: user.role,
        status: user.status,
        verificationLevel: user.verificationLevel,
        trustScore: user.trustScore,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
      listings: counts(listingStats),
      reportsReceived: counts(reportsReceived),
      sanctions: history,
      accountsSharingDevices: linked.map((l) => ({
        id: l.id,
        displayName: l.display_name,
        status: l.status,
        createdAt: l.created_at,
      })),
    };
  }
}
