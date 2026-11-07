import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { sha256 } from '../common/crypto';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import { refreshTokens } from '../db/schema';
import { AccessTokenPayload, Role } from './auth.types';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(DB) private readonly db: Database,
  ) {}

  signAccessToken(user: { id: string; role: Role }): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: env.JWT_ACCESS_SECRET, expiresIn: env.ACCESS_TOKEN_TTL_SEC },
    );
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: env.JWT_ACCESS_SECRET, algorithms: ['HS256'] });
  }

  /** Jeton opaque aléatoire : seul son hachage est stocké en base. */
  generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(48).toString('base64url');
    return { token, hash: sha256(token) };
  }

  refreshExpiry(): Date {
    return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  }

  async createRefreshToken(userId: string, deviceId: string | null): Promise<string> {
    const { token, hash } = this.generateRefreshToken();
    await this.db.insert(refreshTokens).values({
      userId,
      deviceId,
      tokenHash: hash,
      expiresAt: this.refreshExpiry(),
    });
    return token;
  }

  /**
   * Déconnexion d'un appareil : tous ses jetons sont retirés, y compris ceux remplacés depuis moins de 2 min
   * (replacedAt effacé : le délai de tolérance des réessais réseau ne s'applique plus).
   */
  async revokeByToken(token: string): Promise<void> {
    const [row] = await this.db
      .select({ userId: refreshTokens.userId, deviceId: refreshTokens.deviceId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(token)))
      .limit(1);
    if (!row) return;
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: sql`coalesce(${refreshTokens.revokedAt}, now())`, replacedAt: null })
      .where(
        row.deviceId
          ? and(eq(refreshTokens.userId, row.userId), eq(refreshTokens.deviceId, row.deviceId))
          : eq(refreshTokens.tokenHash, sha256(token)),
      );
  }

  /** Toutes les sessions coupées (vol détecté, bannissement…) : aucun ancien jeton ne peut plus être renouvelé. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: sql`coalesce(${refreshTokens.revokedAt}, now())`, replacedAt: null })
      .where(eq(refreshTokens.userId, userId));
  }
}
