import { Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { env } from '../config/env';

export const PUSH_SENDER = Symbol('PUSH_SENDER');

export interface PushMessage {
  to: string; // jeton Firebase (FCM) du téléphone
  title: string;
  body: string;
  data: { url: string }; // écran à ouvrir au toucher
}

/** Résultat par message, dans le même ordre. « gone » : le téléphone n'accepte plus ce jeton (appli désinstallée…). */
export type PushResult = 'ok' | 'gone' | 'error';

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

/** Développement : écrit les notifications dans les journaux (sans le jeton). */
export class ConsolePushSender implements PushSender {
  private readonly log = new Logger('Push[dev]');
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    for (const m of messages) this.log.warn(`${m.title} : ${m.body} → ${m.data.url}`);
    return messages.map(() => 'ok');
  }
}

/** Désactivé : rien n'est envoyé. */
export class NoPushSender implements PushSender {
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    return messages.map(() => 'ok');
  }
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/**
 * Firebase Cloud Messaging, API HTTP v1 (comme LocAr) : seul le service d'envoi de Firebase est utilisé.
 * Compte de service du projet Firebase dans FIREBASE_SERVICE_ACCOUNT_FILE (fichier sur le serveur, jamais dans Git).
 */
export class FcmPushSender implements PushSender {
  private readonly log = new Logger(FcmPushSender.name);
  private readonly account: ServiceAccount;
  private token: { value: string; until: number } | null = null;

  constructor() {
    this.account = JSON.parse(readFileSync(env.FIREBASE_SERVICE_ACCOUNT_FILE!, 'utf8')) as ServiceAccount;
    if (!this.account.project_id || !this.account.client_email || !this.account.private_key) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_FILE : compte de service Firebase incomplet');
    }
  }

  /** Jeton d'accès Google (1 h), obtenu en signant une assertion JWT avec la clé du compte de service. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(
      JSON.stringify({
        iss: this.account.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    );
    const signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(this.account.private_key).toString('base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${signature}` }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
    if (!res.ok || !data?.access_token) throw new Error(`Jeton Google refusé : HTTP ${res.status}`);
    this.token = { value: data.access_token, until: Date.now() + ((data.expires_in ?? 3600) - 300) * 1000 };
    return data.access_token;
  }

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    let auth: string;
    try {
      auth = await this.accessToken();
    } catch (e) {
      this.log.error(`${e}`);
      return messages.map(() => 'error');
    }
    const url = `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`;
    return Promise.all(
      messages.map(async (m): Promise<PushResult> => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                token: m.to,
                notification: { title: m.title, body: m.body },
                data: m.data,
                android: { priority: 'high', notification: { channel_id: 'default', sound: 'default' } },
                apns: { payload: { aps: { sound: 'default' } } },
              },
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (res.ok) return 'ok';
          const err = (await res.json().catch(() => null)) as { error?: { status?: string; details?: Array<{ errorCode?: string }> } } | null;
          const code = err?.error?.details?.find((d) => d.errorCode)?.errorCode ?? err?.error?.status;
          // Jeton périmé (appli désinstallée, données effacées) ou invalide : on l'oublie
          if (res.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') return 'gone';
          this.log.error(`Envoi refusé : HTTP ${res.status} ${code ?? ''}`);
          return 'error';
        } catch (e) {
          this.log.error(`Envoi impossible : ${e}`);
          return 'error';
        }
      }),
    );
  }
}
