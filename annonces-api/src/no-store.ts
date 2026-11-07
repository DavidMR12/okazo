import { NestFastifyApplication } from '@nestjs/platform-fastify';

/** Par défaut rien n'est mis en cache : seules les routes publiques le demandent explicitement (@Header). */
export function noStoreByDefault(app: NestFastifyApplication) {
  app.getHttpAdapter().getInstance().addHook('onSend', async (_req, reply) => {
    if (!reply.hasHeader('cache-control')) reply.header('Cache-Control', 'private, no-store');
  });
}
