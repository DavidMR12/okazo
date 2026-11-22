import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import { listings, payments } from '../db/schema';
import { PAYMENT_COUNTRIES, PAYMENT_GATEWAY, PaymentGateway } from './payment-gateway';

/** Une page de paiement pawaPay vit 15 minutes : passé ce délai sans paiement lancé, l'achat est abandonné. */
const ABANDON_AFTER_MS = 20 * 60 * 1000;

const FAILURE_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE: 'Solde insuffisant sur votre compte Mobile Money.',
  PAYMENT_NOT_APPROVED: 'Paiement non confirmé sur votre téléphone.',
  PAYER_NOT_FOUND: 'Ce numéro n’a pas de compte Mobile Money chez cet opérateur.',
  PAYER_LIMIT_REACHED: 'Votre plafond Mobile Money est atteint.',
  WALLET_LIMIT_REACHED: 'Votre plafond Mobile Money est atteint.',
  PAYMENT_IN_PROGRESS: 'Un autre paiement est en cours sur ce numéro. Réessayez dans quelques minutes.',
};

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway | null,
  ) {}

  /** Offres affichées sur le site. enabled = false : pas de bouton d'achat. */
  offers(countryCode?: string) {
    const enabled = !!this.gateway && (!countryCode || countryCode in PAYMENT_COUNTRIES);
    return { enabled, offers: env.BOOST_OFFERS.map((o) => ({ days: o.days, priceXaf: o.priceXaf })) };
  }

  /** Achat d'une mise « À la une » : crée le paiement et renvoie l'adresse de la page de paiement. */
  async startBoost(userId: string, listingId: string, days: number) {
    if (!this.gateway) {
      throw new ServiceUnavailableException({ code: 'PAYMENTS_DISABLED', message: 'Le paiement en ligne arrive bientôt.' });
    }
    const offer = env.BOOST_OFFERS.find((o) => o.days === days);
    if (!offer) throw new BadRequestException({ code: 'INVALID_OFFER', message: 'Offre inconnue.' });

    const [l] = await this.db
      .select({ id: listings.id, userId: listings.userId, status: listings.status, countryCode: listings.countryCode, title: listings.title })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);
    if (!l || l.userId !== userId || l.status === 'removed') {
      throw new NotFoundException({ code: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' });
    }
    if (l.status !== 'active') {
      throw new ForbiddenException({ code: 'LISTING_NOT_ACTIVE', message: 'Seule une annonce en ligne peut être mise à la une.' });
    }
    if (!(l.countryCode in PAYMENT_COUNTRIES)) {
      throw new ForbiddenException({ code: 'COUNTRY_NOT_SUPPORTED', message: 'Le paiement n’est pas encore disponible dans ce pays.' });
    }

    const id = randomUUID();
    await this.db.insert(payments).values({
      id,
      userId,
      listingId,
      product: 'boost',
      boostDays: offer.days,
      amountXaf: offer.priceXaf,
      countryCode: l.countryCode,
      provider: this.gateway.name,
    });
    try {
      const { redirectUrl } = await this.gateway.startCheckout({
        paymentId: id,
        amountXaf: offer.priceXaf,
        countryCode: l.countryCode,
        reason: `À la une ${offer.days} jours : ${l.title}`,
        returnUrl: env.PAYMENT_RETURN_URL,
      });
      return { paymentId: id, redirectUrl };
    } catch {
      await this.db.update(payments).set({ status: 'failed', failureCode: 'PAYMENT_PAGE_FAILED' }).where(eq(payments.id, id));
      throw new ServiceUnavailableException({ code: 'PAYMENT_UNAVAILABLE', message: 'Paiement indisponible pour le moment. Réessayez dans quelques minutes.' });
    }
  }

  /** Statut d'un paiement pour son auteur (page de retour du site). Relit le prestataire tant qu'il est en attente. */
  async get(userId: string, id: string) {
    let [p] = await this.db.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, userId))).limit(1);
    if (!p) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Paiement introuvable.' });
    if (p.status === 'pending') {
      await this.refresh(id);
      [p] = await this.db.select().from(payments).where(eq(payments.id, id)).limit(1);
    }
    const [l] = p.listingId
      ? await this.db.select({ boostUntil: listings.boostUntil, title: listings.title }).from(listings).where(eq(listings.id, p.listingId)).limit(1)
      : [];
    return {
      id: p.id,
      status: p.status,
      amountXaf: p.amountXaf,
      days: p.boostDays,
      listingId: p.listingId,
      listingTitle: l?.title ?? null,
      boostUntil: p.status === 'completed' ? (l?.boostUntil ?? null) : null,
      message: p.status === 'failed' ? (FAILURE_MESSAGES[p.failureCode ?? ''] ?? 'Le paiement n’a pas abouti. Aucun montant n’a été prélevé.') : null,
    };
  }

  /**
   * Notification du prestataire : un simple signal. On ne lit rien dans son contenu sauf l'identifiant,
   * puis on relit le statut auprès du prestataire avec notre clé. Une fausse notification ne livre donc rien.
   */
  async onNotification(paymentId: unknown) {
    if (typeof paymentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(paymentId)) return;
    await this.refresh(paymentId).catch((e) => this.log.error(`Notification ${paymentId} : ${e}`));
  }

  /** Relit le statut auprès du prestataire et livre la mise à la une une seule fois. */
  async refresh(id: string) {
    if (!this.gateway) return;
    const [p] = await this.db.select().from(payments).where(eq(payments.id, id)).limit(1);
    if (!p || p.status !== 'pending' || p.provider !== this.gateway.name) return;

    const s = await this.gateway.status(id);
    const now = new Date();
    if (s.state === 'pending') {
      await this.db.update(payments).set({ checkedAt: now }).where(eq(payments.id, id));
      return;
    }
    if (s.state === 'not_found') {
      const abandoned = now.getTime() - p.createdAt.getTime() > ABANDON_AFTER_MS;
      await this.db
        .update(payments)
        .set(abandoned ? { status: 'expired', checkedAt: now } : { checkedAt: now })
        .where(and(eq(payments.id, id), eq(payments.status, 'pending')));
      return;
    }
    if (s.state === 'failed') {
      await this.db
        .update(payments)
        .set({ status: 'failed', failureCode: s.failureCode, checkedAt: now })
        .where(and(eq(payments.id, id), eq(payments.status, 'pending')));
      return;
    }

    // Payé : le montant et la devise doivent être exactement ceux demandés
    if (s.currency !== 'XAF' || s.amountXaf !== p.amountXaf) {
      this.log.error(`Paiement ${id} : montant reçu ${s.amountXaf} ${s.currency}, attendu ${p.amountXaf} XAF. À vérifier et rembourser.`);
      await this.db
        .update(payments)
        .set({ status: 'failed', failureCode: 'AMOUNT_MISMATCH', providerTxId: s.providerTxId, checkedAt: now })
        .where(and(eq(payments.id, id), eq(payments.status, 'pending')));
      return;
    }
    await this.db.transaction(async (tx) => {
      const done = await tx
        .update(payments)
        .set({ status: 'completed', completedAt: now, checkedAt: now, providerTxId: s.providerTxId })
        .where(and(eq(payments.id, id), eq(payments.status, 'pending')))
        .returning({ id: payments.id });
      if (!done.length || !p.listingId) return; // déjà livré (notification et page de retour en même temps)
      // Les jours achetés s'ajoutent à une mise à la une encore en cours
      await tx
        .update(listings)
        .set({ boostUntil: sql`greatest(coalesce(${listings.boostUntil}, now()), now()) + make_interval(days => ${p.boostDays})` })
        .where(eq(listings.id, p.listingId));
    });
    this.log.log(`Paiement ${id} reçu : annonce à la une ${p.boostDays} jours`);
  }

  /** Rattrapage (tâche de maintenance) : paiements en attente dont la notification s'est perdue. */
  async reconcile() {
    if (!this.gateway) return 0;
    const pending = await this.db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.status, 'pending'), lt(payments.createdAt, new Date(Date.now() - 60_000)), sql`${payments.createdAt} > now() - interval '7 days'`))
      .limit(200);
    for (const p of pending) await this.refresh(p.id).catch((e) => this.log.error(`Rattrapage ${p.id} : ${e}`));
    return pending.length;
  }
}
