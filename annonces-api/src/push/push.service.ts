import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { Database, DB } from '../db/db.module';
import { conversations, listings, messages, pushTokens, users } from '../db/schema';
import { REDIS } from '../redis/redis.module';
import { PUSH_SENDER, PushSender } from './push-sender';

/** Jeton Firebase (FCM) d'un téléphone : lettres, chiffres, « : », « _ », « - ». */
export const PUSH_TOKEN = /^[A-Za-z0-9:_-]{100,4096}$/;

/** Les messages sont rattachés après validation de leur transaction : on attend un peu avant de les relire. */
const AFTER_COMMIT_MS = 1500;
/** Une seule notification par conversation et par minute (rafale de messages courts). */
const MESSAGE_COOLDOWN_SEC = 60;

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Notifications push du téléphone. Vie privée : le contenu d'un message n'apparaît jamais sur l'écran verrouillé,
 * seulement l'expéditeur et l'annonce. Aucune erreur d'envoi ne remonte à l'action qui l'a déclenchée.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  async register(userId: string, token: string, platform: 'android' | 'ios') {
    await this.db
      .insert(pushTokens)
      .values({ token, userId, platform })
      .onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform, lastSeenAt: new Date() } });
    // Au plus 10 téléphones par compte : on oublie les plus anciens
    await this.db.execute(
      sql`delete from push_tokens where user_id = ${userId} and token not in
        (select token from push_tokens where user_id = ${userId} order by last_seen_at desc limit 10)`,
    );
  }

  async unregister(userId: string, token: string) {
    await this.db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.userId, userId)));
  }

  /** Envoie à tous les téléphones d'un compte actif. */
  async notifyUser(userId: string, title: string, body: string, url: string) {
    const rows = await this.db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .innerJoin(users, eq(users.id, pushTokens.userId))
      .where(and(eq(pushTokens.userId, userId), eq(users.status, 'active')));
    if (!rows.length) return;
    const results = await this.sender.send(rows.map((r) => ({ to: r.token, title, body, data: { url } })));
    const gone = rows.filter((_, i) => results[i] === 'gone').map((r) => r.token);
    if (gone.length) await this.db.delete(pushTokens).where(inArray(pushTokens.token, gone));
  }

  /** Lance une notification sans attendre ni faire échouer l'appelant. */
  private fire(task: () => Promise<void>, delayMs = 0) {
    setTimeout(() => void task().catch((e) => this.log.error(`Notification impossible : ${e}`)), delayMs);
  }

  /** Nouveau message (ou étape d'une offre) : prévient l'autre participant. */
  messageSent(messageId: number) {
    this.fire(async () => {
      const [m] = await this.db
        .select({
          kind: messages.kind,
          body: messages.body,
          senderId: messages.senderId,
          conversationId: messages.conversationId,
          buyerId: conversations.buyerId,
          sellerId: conversations.sellerId,
          title: listings.title,
          senderName: users.displayName,
        })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .innerJoin(listings, eq(listings.id, conversations.listingId))
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(eq(messages.id, messageId))
        .limit(1);
      if (!m) return; // transaction annulée
      const to = m.senderId === m.buyerId ? m.sellerId : m.buyerId;
      const url = `/conversation/${m.conversationId}`;
      if (m.kind === 'text') {
        const first = await this.redis.set(`push:conv:${to}:${m.conversationId}`, '1', 'EX', MESSAGE_COOLDOWN_SEC, 'NX');
        if (first !== 'OK') return;
        await this.notifyUser(to, short(m.senderName, 40), `Nouveau message · ${short(m.title)}`, url);
      } else {
        // Étapes d'une offre : « Offre : 170 000 FCFA », « Offre acceptée »… (texte écrit par l'application)
        await this.notifyUser(to, short(m.senderName, 40), `${short(m.body, 80)} · ${short(m.title, 40)}`, url);
      }
    }, AFTER_COMMIT_MS);
  }

  /** Décision de modération sur une annonce : prévient son auteur. */
  listingDecided(listingId: string, status: 'active' | 'rejected') {
    this.fire(async () => {
      const [l] = await this.db
        .select({ userId: listings.userId, title: listings.title, status: listings.status })
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1);
      if (!l || l.status !== status) return;
      if (status === 'active') await this.notifyUser(l.userId, 'Annonce en ligne', short(l.title, 80), `/listing/${listingId}`);
      else await this.notifyUser(l.userId, 'Annonce refusée', `${short(l.title)} : voyez pourquoi et corrigez-la.`, '/my-listings');
    }, AFTER_COMMIT_MS);
  }
}
