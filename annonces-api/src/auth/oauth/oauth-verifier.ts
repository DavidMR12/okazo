import { Injectable, UnauthorizedException } from '@nestjs/common';
import { env } from '../../config/env';

export const OAUTH_VERIFIER = Symbol('OAUTH_VERIFIER');
export type OAuthProvider = 'google' | 'facebook';

export interface OAuthProfile {
  provider: OAuthProvider;
  subject: string; // identifiant stable chez le fournisseur
  name: string | null;
  email: string | null;
}

export interface OAuthVerifier {
  readonly enabled: Record<OAuthProvider, boolean>;
  verify(provider: OAuthProvider, token: string): Promise<OAuthProfile>;
}

const invalid = () => new UnauthorizedException({ code: 'OAUTH_INVALID', message: 'Connexion refusée par le service. Réessayez.' });

/**
 * Vérifie le jeton auprès du fournisseur lui-même : on ne fait jamais confiance au profil envoyé par le client.
 * - Google : jeton d'identité (ID token) émis pour l'un de nos identifiants clients (site, Android, iOS).
 * - Facebook : jeton d'accès vérifié par debug_token pour NOTRE application, puis lecture du profil.
 */
@Injectable()
export class HttpOAuthVerifier implements OAuthVerifier {
  readonly enabled = {
    google: env.GOOGLE_CLIENT_IDS.length > 0,
    facebook: !!(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET),
  };

  async verify(provider: OAuthProvider, token: string): Promise<OAuthProfile> {
    if (!this.enabled[provider]) {
      throw new UnauthorizedException({ code: 'OAUTH_DISABLED', message: 'Ce mode de connexion n’est pas disponible.' });
    }
    return provider === 'google' ? this.google(token) : this.facebook(token);
  }

  private async google(idToken: string): Promise<OAuthProfile> {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res?.ok) throw invalid();
    const t = (await res.json()) as { aud?: string; iss?: string; sub?: string; exp?: string; name?: string; email?: string; email_verified?: string };
    const okIssuer = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
    if (!t.sub || !t.aud || !okIssuer || !env.GOOGLE_CLIENT_IDS.includes(t.aud) || Number(t.exp) * 1000 < Date.now()) throw invalid();
    return { provider: 'google', subject: t.sub, name: t.name ?? null, email: t.email_verified === 'true' ? (t.email ?? null) : null };
  }

  private async facebook(accessToken: string): Promise<OAuthProfile> {
    const appToken = `${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`;
    const dbg = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
      { signal: AbortSignal.timeout(8000) },
    ).catch(() => null);
    if (!dbg?.ok) throw invalid();
    const d = ((await dbg.json()) as { data?: { is_valid?: boolean; app_id?: string; user_id?: string } }).data;
    if (!d?.is_valid || d.app_id !== env.FACEBOOK_APP_ID || !d.user_id) throw invalid();
    const me = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    const p = me?.ok ? ((await me.json()) as { id?: string; name?: string; email?: string }) : {};
    return { provider: 'facebook', subject: d.user_id, name: p.name ?? null, email: p.email ?? null };
  }
}
