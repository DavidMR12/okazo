import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { env } from '../config/env';
import { bullConnection } from '../redis/bull-connection';
import { ModerationService } from './moderation.service';

const QUEUE_NAME = 'moderation';

@Injectable()
export class ModerationQueue implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ModerationQueue.name);
  private queue!: Queue;
  private worker?: Worker;

  constructor(private readonly moderation: ModerationService) {}

  onModuleInit() {
    this.queue = new Queue(QUEUE_NAME, {
      connection: bullConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });

    // RUN_MODERATION_WORKER=false permet de faire tourner le worker dans un processus séparé plus tard.
    if (env.RUN_MODERATION_WORKER) {
      this.worker = new Worker(QUEUE_NAME, (job) => this.moderation.process(job.data.listingId as string), {
        connection: bullConnection(),
        concurrency: env.MODERATION_CONCURRENCY,
      });
      this.worker.on('failed', (job, err) =>
        this.log.error(`Modération échouée (annonce ${job?.data?.listingId}, essai ${job?.attemptsMade}) : ${err.message}`),
      );
    }
  }

  async enqueue(listingId: string): Promise<void> {
    // Identifiant unique par demande (BullMQ interdit ":" dans un jobId) : une modification relance l'analyse.
    await this.queue.add('moderate', { listingId }, { jobId: `${listingId}-${Date.now()}` });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }
}
