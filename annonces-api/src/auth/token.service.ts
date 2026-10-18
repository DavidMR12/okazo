import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull } from 'drizzle-orm';
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
    return this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: env.JWT_ACCESS_SECRET });
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

  async revokeByToken(token: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, sha256(token)), isNull(refreshTokens.revokedAt)));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
