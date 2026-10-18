import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { isIP } from 'node:net';
import { RateLimitService } from '../common/rate-limit.service';
import { sha256 } from '../common/crypto';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import { devices, refreshTokens, termsAcceptances, userIdentities, users } from '../db/schema';
import { REDIS } from '../redis/redis.module';
import { OAUTH_VERIFIER, OAuthProvider, OAuthVerifier } from './oauth/oauth-verifier';
import {
  AcceptTermsInput,
  EmailForgotInput,
  EmailLoginInput,
  EmailRegisterInput,
  EmailResetInput,
  EmailVerifyInput,
  LinkIdentityInput,
  OAuthInput,
  PhoneRequestInput,
  PhoneVerifyInput,
  RefreshInput,
  RequestOtpInput,
  VerifyOtpInput,
} from './auth.schemas';
import { EmailCodeService } from './email-code.service';
import { hashPassword, verifyPassword } from './password';
import { BlocklistService } from './blocklist.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

type UserRow = typeof users.$inferSelect;

// Sur réseau instable, un client peut réessayer avec un ancien jeton alors que le serveur
// l'a déjà renouvelé. En dessous de ce délai, on refuse simplement sans déconnecter l'utilisateur.
const REUSE_GRACE_MS = 30_000;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly blocklist: BlocklistService,
    private readonly rateLimit: RateLimitService,
    @Inject(OAUTH_VERIFIER) private readonly oauth: OAuthVerifier,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly emailCodes: EmailCodeService,
  ) {}

  async requestOtp(input: RequestOtpInput, ip: string) {
    const { e164 } = await this.otp.parsePhone(input.phone);
    return this.otp.request(e164, ip, input.channel);
  }

  /** Modes de connexion proposés aux clients (les boutons absents ne sont pas configurés). */
  methods() {
    // Facebook retiré des écrans (décision du porteur, 15 octobre 2026) : plus jamais proposé
    return { otpChannels: this.otp.channels(), google: this.oauth.enabled.google, facebook: false, email: this.emailCodes.enabled };
  }

  async verifyOtp(input: VerifyOtpInput, ip: string) {
    await this.rateLimit.hit(`rl:verify:ip:${ip}`, 30, 3600);

    const { e164, country } = await this.otp.parsePhone(input.phone);
    // L'empreinte est un signal anti-fraude, pas une preuve d'identité (facile à imiter sur le web).
    const fingerprintHash = sha256(input.device.fingerprint);

    if (await this.blocklist.isBlocked('phone', e164)) {
      throw new ForbiddenException({ code: 'PHONE_BLOCKED', message: 'Ce numéro ne peut pas être utilisé.' });
    }
    if (await this.blocklist.isBlocked('device', fingerprintHash)) {
      throw new ForbiddenException({ code: 'DEVICE_BLOCKED', message: 'Cet appareil ne peut pas être utilisé.' });
    }

    await this.otp.verify(e164, input.code);

    // Trouve ou crée le compte
    let isNew = false;
    let [user] = await this.db.select().from(users).where(eq(users.phoneE164, e164)).limit(1);
    if (!user) {
      try {
        // Numéro ayant supprimé un compte sous sanction : on repart avec des limites strictes
        const flagged = await this.blocklist.isFlagged('phone', e164);
        [user] = await this.db
          .insert(users)
          .values({ phoneE164: e164, countryCode: country, ...(flagged ? { trustScore: -20, dailyListingLimit: 1 } : {}) })
          .returning();
        isNew = true;
      } catch (err) {
        // Création simultanée par une autre requête : on relit le compte existant
        [user] = await this.db.select().from(users).where(eq(users.phoneE164, e164)).limit(1);
        if (!user) throw err;
      }
    }

    return this.openSession(user, input.device, ip, isNew);
  }

  /**
   * Connexion avec Google ou Facebook. Le compte est retrouvé par le compte lié (jamais par l'adresse e-mail,
   * qui ne prouve rien chez nous) ; sinon un compte SANS numéro est créé : il devra en vérifier un pour agir.
   */
  async oauthLogin(input: OAuthInput, ip: string) {
    await this.rateLimit.hit(`rl:oauth:ip:${ip}`, 30, 3600);
    const fingerprintHash = sha256(input.device.fingerprint);
    if (await this.blocklist.isBlocked('device', fingerprintHash)) {
      throw new ForbiddenException({ code: 'DEVICE_BLOCKED', message: 'Cet appareil ne peut pas être utilisé.' });
    }
    const profile = await this.oauth.verify(input.provider, input.token);

    const [link] = await this.db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, profile.provider), eq(userIdentities.subject, profile.subject)))
      .limit(1);
    let user: UserRow | undefined;
    let isNew = false;
    if (link) {
      [user] = await this.db.select().from(users).where(eq(users.id, link.userId)).limit(1);
    } else {
      // Nouveau compte : pays choisi par le client (doit être ouvert), nom du profil
      const country = (await this.otp.activeCountryCodes()).has(input.country) ? input.country : 'CM';
      user = await this.db.transaction(async (tx) => {
        const [u] = await tx
          .insert(users)
          .values({ phoneE164: null, countryCode: country, displayName: (profile.name ?? 'Utilisateur').trim().slice(0, 40) || 'Utilisateur' })
          .returning();
        await tx.insert(userIdentities).values({ userId: u.id, provider: profile.provider, subject: profile.subject, email: profile.email });
        return u;
      });
      isNew = true;
    }
    if (!user || user.status === 'deleted') throw new ForbiddenException({ code: 'ACCOUNT_DELETED', message: 'Ce compte a été supprimé.' });
    return this.openSession(user, input.device, ip, isNew);
  }

  // ------------------------------------------------------------------ e-mail et mot de passe
  /**
   * Inscription : l'adresse est confirmée par un code AVANT la création du compte (personne ne peut
   * s'inscrire avec l'adresse d'un autre). En attendant, la demande est gardée 15 min dans Redis.
   */
  async emailRegister(input: EmailRegisterInput, ip: string) {
    if (await this.userByEmail(input.email)) throw this.emailInUse();
    const country = (await this.otp.activeCountryCodes()).has(input.country) ? input.country : 'CM';
    const pending = { passwordHash: await hashPassword(input.password), displayName: input.displayName, country };
    const sent = await this.emailCodes.send('register', input.email, ip);
    await this.redis.set(`ereg:${input.email}`, JSON.stringify(pending), 'EX', sent.expiresInSec);
    return sent;
  }

  async emailVerify(input: EmailVerifyInput, ip: string) {
    await this.rateLimit.hit(`rl:verify:ip:${ip}`, 30, 3600);
    await this.assertDeviceAllowed(input.device.fingerprint);
    await this.emailCodes.verify('register', input.email, input.code);
    const raw = await this.redis.get(`ereg:${input.email}`);
    if (!raw) throw new ForbiddenException({ code: 'CODE_EXPIRED', message: 'Code expiré. Recommencez l’inscription.' });
    await this.redis.del(`ereg:${input.email}`);
    const pending = JSON.parse(raw) as { passwordHash: string; displayName: string; country: string };
    let user: UserRow;
    try {
      [user] = await this.db
        .insert(users)
        .values({ phoneE164: null, email: input.email, emailVerifiedAt: new Date(), passwordHash: pending.passwordHash, displayName: pending.displayName, countryCode: pending.country })
        .returning();
    } catch {
      throw this.emailInUse(); // adresse prise entre-temps (contrainte d'unicité)
    }
    return this.openSession(user, input.device, ip, true);
  }

  async emailLogin(input: EmailLoginInput, ip: string) {
    // Contre les essais de mots de passe en série : par adresse et par IP
    await this.rateLimit.hit(`rl:login:mail:${input.email}`, 10, 900);
    await this.rateLimit.hit(`rl:login:ip:${ip}`, 50, 900);
    await this.assertDeviceAllowed(input.device.fingerprint);
    const user = await this.userByEmail(input.email);
    const ok = await verifyPassword(input.password, user?.passwordHash ?? null);
    if (!user || !ok || user.status === 'deleted') {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Adresse e-mail ou mot de passe incorrect.' });
    }
    return this.openSession(user, input.device, ip, false);
  }

  /** Mot de passe oublié : même réponse que l'adresse ait un compte ou non (on ne révèle rien). */
  async emailForgot(input: EmailForgotInput, ip: string) {
    const user = await this.userByEmail(input.email);
    if (!user || user.status === 'deleted') {
      await this.rateLimit.hit(`rl:mail:ip:${ip}`, 20, 3600);
      return { expiresInSec: 900, resendAfterSec: 60 };
    }
    return this.emailCodes.send('reset', input.email, ip);
  }

  /** Nouveau mot de passe : toutes les sessions ouvertes sont fermées, puis on connecte cet appareil. */
  async emailReset(input: EmailResetInput, ip: string) {
    await this.assertDeviceAllowed(input.device.fingerprint);
    await this.emailCodes.verify('reset', input.email, input.code);
    const user = await this.userByEmail(input.email);
    if (!user || user.status === 'deleted') throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Adresse e-mail ou mot de passe incorrect.' });
    const [u] = await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.password), emailVerifiedAt: user.emailVerifiedAt ?? new Date() })
      .where(eq(users.id, user.id))
      .returning();
    await this.tokens.revokeAllForUser(user.id);
    return this.openSession(u, input.device, ip, false);
  }

  private async userByEmail(email: string): Promise<UserRow | undefined> {
    const [u] = await this.db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
    return u;
  }

  private async assertDeviceAllowed(fingerprint: string) {
    if (await this.blocklist.isBlocked('device', sha256(fingerprint))) {
      throw new ForbiddenException({ code: 'DEVICE_BLOCKED', message: 'Cet appareil ne peut pas être utilisé.' });
    }
  }

  private emailInUse() {
    return new ConflictException({ code: 'EMAIL_IN_USE', message: 'Cette adresse a déjà un compte : connectez-vous, ou choisissez « Mot de passe oublié ».' });
  }

  // ------------------------------------------------------------------ conditions générales d'utilisation
  /** Acceptation explicite des CGU : on garde chaque acceptation (version, date, IP, appareil) comme preuve. */
  async acceptTerms(userId: string, input: AcceptTermsInput, ip: string) {
    if (input.version !== env.TERMS_VERSION) {
      throw new ConflictException({ code: 'TERMS_OUTDATED', message: 'Les conditions ont changé : rechargez la page pour lire la nouvelle version.' });
    }
    const now = new Date();
    const [u] = await this.db.transaction(async (tx) => {
      await tx.insert(termsAcceptances).values({ userId, version: input.version, acceptedAt: now, ip: isIP(ip) ? ip : null, platform: input.platform ?? null });
      return tx.update(users).set({ termsVersion: input.version, termsAcceptedAt: now }).where(eq(users.id, userId)).returning();
    });
    return this.toPublicUser(u);
  }

  // ------------------------------------------------------------------ numéro d'un compte Google ou Facebook
  async requestPhoneLink(userId: string, input: PhoneRequestInput, ip: string) {
    const { e164 } = await this.otp.parsePhone(input.phone);
    const [other] = await this.db.select({ id: users.id }).from(users).where(eq(users.phoneE164, e164)).limit(1);
    if (other && other.id !== userId) throw this.phoneInUse();
    return this.otp.request(e164, ip, input.channel);
  }

  async verifyPhoneLink(userId: string, input: PhoneVerifyInput) {
    const { e164 } = await this.otp.parsePhone(input.phone);
    if (await this.blocklist.isBlocked('phone', e164)) {
      throw new ForbiddenException({ code: 'PHONE_BLOCKED', message: 'Ce numéro ne peut pas être utilisé.' });
    }
    await this.otp.verify(e164, input.code);
    const flagged = await this.blocklist.isFlagged('phone', e164);
    try {
      const [u] = await this.db
        .update(users)
        .set({ phoneE164: e164, ...(flagged ? { trustScore: -20, dailyListingLimit: 1 } : {}) })
        .where(eq(users.id, userId))
        .returning();
      return this.toPublicUser(u);
    } catch {
      throw this.phoneInUse(); // contrainte d'unicité : le numéro a été pris entre-temps
    }
  }

  private phoneInUse() {
    return new ConflictException({
      code: 'PHONE_IN_USE',
      message: 'Ce numéro a déjà un compte. Connectez-vous avec ce numéro, puis associez Google ou Facebook depuis Mon compte.',
    });
  }

  // ------------------------------------------------------------------ comptes liés
  async linkIdentity(userId: string, input: LinkIdentityInput) {
    const profile = await this.oauth.verify(input.provider, input.token);
    const [taken] = await this.db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, profile.provider), eq(userIdentities.subject, profile.subject)))
      .limit(1);
    if (taken && taken.userId !== userId) {
      throw new ConflictException({ code: 'IDENTITY_IN_USE', message: 'Ce compte est déjà associé à un autre utilisateur.' });
    }
    await this.db
      .insert(userIdentities)
      .values({ userId, provider: profile.provider, subject: profile.subject, email: profile.email })
      .onConflictDoUpdate({ target: [userIdentities.userId, userIdentities.provider], set: { subject: profile.subject, email: profile.email } });
    return { identities: await this.identities(userId) };
  }

  async unlinkIdentity(userId: string, provider: OAuthProvider) {
    // Jamais de compte sans moyen de connexion : il faut un numéro, un e-mail avec mot de passe, ou un autre compte lié
    const [u] = await this.db.select({ phone: users.phoneE164, password: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
    const others = (await this.identities(userId)).filter((p) => p !== provider);
    if (!u?.phone && !u?.password && !others.length) {
      throw new ConflictException({ code: 'LAST_LOGIN_METHOD', message: 'Ajoutez d’abord un numéro de téléphone : sinon vous ne pourriez plus vous connecter.' });
    }
    await this.db.delete(userIdentities).where(and(eq(userIdentities.userId, userId), eq(userIdentities.provider, provider)));
    return { identities: others };
  }

  private async identities(userId: string): Promise<OAuthProvider[]> {
    const rows = await this.db.select({ provider: userIdentities.provider }).from(userIdentities).where(eq(userIdentities.userId, userId));
    return rows.map((r) => r.provider);
  }

  /** Session commune aux connexions par code et par Google ou Facebook : appareil, jetons, contrôles. */
  private async openSession(user: UserRow, deviceInput: { fingerprint: string; platform: 'ios' | 'android' | 'web' }, ip: string, isNew: boolean) {
    const fingerprintHash = sha256(deviceInput.fingerprint);
    const input = { device: deviceInput };
    if (user.status === 'banned') {
      throw new ForbiddenException({ code: 'ACCOUNT_BANNED', message: 'Ce compte a été banni.' });
    }

    const now = new Date();
    const [device] = await this.db
      .insert(devices)
      .values({
        userId: user.id,
        fingerprintHash,
        platform: input.device.platform,
        lastIp: isIP(ip) ? ip : null,
      })
      .onConflictDoUpdate({
        target: [devices.userId, devices.fingerprintHash],
        set: { lastSeenAt: now, lastIp: isIP(ip) ? ip : null },
      })
      .returning();

    if (device.isBlocked) {
      throw new ForbiddenException({ code: 'DEVICE_BLOCKED', message: 'Cet appareil ne peut pas être utilisé.' });
    }

    await this.db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));

    return {
      accessToken: await this.tokens.signAccessToken(user),
      refreshToken: await this.tokens.createRefreshToken(user.id, device.id),
      expiresIn: env.ACCESS_TOKEN_TTL_SEC,
      isNewUser: isNew,
      // Compte sans numéro (créé avec Google ou Facebook) : l'appli propose de le vérifier
      phoneRequired: !user.phoneE164,
      user: this.toPublicUser(user),
    };
  }

  async refresh(input: RefreshInput) {
    const hash = sha256(input.refreshToken);
    const next = this.tokens.generateRefreshToken();

    const outcome = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hash))
        .for('update');

      if (!row) return { kind: 'invalid' } as const;

      if (row.revokedAt) {
        // Jeton déjà utilisé : possible vol de session, sauf simple réessai réseau récent
        const recent = Date.now() - row.revokedAt.getTime() < REUSE_GRACE_MS;
        return { kind: recent ? 'invalid' : 'reuse', userId: row.userId } as const;
      }
      if (row.expiresAt.getTime() <= Date.now()) return { kind: 'invalid' } as const;

      const [user] = await tx.select().from(users).where(eq(users.id, row.userId)).limit(1);
      if (!user || user.status === 'banned') return { kind: 'invalid' } as const;

      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
      await tx.insert(refreshTokens).values({
        userId: user.id,
        deviceId: row.deviceId,
        tokenHash: next.hash,
        expiresAt: this.tokens.refreshExpiry(),
      });
      return { kind: 'ok', user } as const;
    });

    // La révocation totale est faite APRÈS la transaction, sinon l'erreur l'annulerait.
    if (outcome.kind === 'reuse') await this.tokens.revokeAllForUser(outcome.userId);
    if (outcome.kind !== 'ok') {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Session expirée, reconnectez-vous.',
      });
    }

    return {
      accessToken: await this.tokens.signAccessToken(outcome.user),
      refreshToken: next.token,
      expiresIn: env.ACCESS_TOKEN_TTL_SEC,
    };
  }

  async logout(input: RefreshInput): Promise<void> {
    await this.tokens.revokeByToken(input.refreshToken);
  }

  async me(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Session expirée.' });
    return { ...this.toPublicUser(user), identities: await this.identities(userId) };
  }

  // Le score de confiance reste interne (anti-fraude) et n'est jamais renvoyé au client.
  private toPublicUser(u: UserRow) {
    return {
      id: u.id,
      phone: u.phoneE164,
      email: u.email,
      // CGU : version en vigueur acceptée ? (sinon l'écran d'acceptation s'affiche avant toute action)
      termsAccepted: u.termsVersion === env.TERMS_VERSION,
      termsVersion: env.TERMS_VERSION,
      countryCode: u.countryCode,
      cityId: u.cityId,
      displayName: u.displayName,
      role: u.role,
      status: u.status,
      verificationLevel: u.verificationLevel,
      contactPreference: u.contactPreference,
    };
  }
}
