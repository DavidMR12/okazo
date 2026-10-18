import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { sql } from 'drizzle-orm';
import { env } from '../config/env';
import { Database, DB } from '../db/db.module';
import { bullConnection } from '../redis/bull-connection';

const QUEUE_NAME = 'maintenance';
const EVERY_MS = 15 * 60 * 1000;

/**
 * Toutes les 15 minutes : expire les annonces de plus de 30 jours et lève les suspensions arrivées à terme
 * (fonctions SQL de db/schema.sql). Le planificateur est idempotent : plusieurs instances de l'API
 * ne créent qu'une seule tâche récurrente.
 */
@Injectable()
export class MaintenanceQueue implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MaintenanceQueue.name);
  private queue!: Queue;
  private worker?: Worker;

  constructor(@Inject(DB) private readonly db: Database) {}

  onModuleInit() {
    this.queue = new Queue(QUEUE_NAME, { connection: bullConnection() });
    // Pas d'await : un Redis indisponible au démarrage ne doit pas bloquer l'API
    this.queue
      .upsertJobScheduler('maintenance-15min', { every: EVERY_MS }, {
        name: 'maintenance',
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      })
      .catch((e) => this.log.error(`Planification impossible : ${e}`));

    if (env.RUN_MAINTENANCE_WORKER) {
      this.worker = new Worker(QUEUE_NAME, () => this.run(), { connection: bullConnection(), concurrency: 1 });
      this.worker.on('failed', (_job, err) => this.log.error(`Maintenance échouée : ${err.message}`));
    }
  }

  private async run() {
    const [expired] = (await this.db.execute(sql`select expire_old_listings() as n`)) as unknown as Array<{ n: number }>;
    const [lifted] = (await this.db.execute(sql`select lift_expired_suspensions() as n`)) as unknown as Array<{ n: number }>;
    const e = Number(expired?.n ?? 0);
    const l = Number(lifted?.n ?? 0);
    if (e || l) this.log.log(`${e} annonce(s) expirée(s), ${l} suspension(s) levée(s)`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }
}
