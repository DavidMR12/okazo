import 'reflect-metadata';
import helmet from '@fastify/helmet';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  // req.ip = IP réelle du client, lue dans X-Forwarded-For seulement si la requête vient d'un relais de confiance
  // (voir TRUSTED_PROXIES). Avec « true », un client pourrait choisir son IP et contourner les limites anti-abus.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: env.TRUSTED_PROXIES, bodyLimit: 1_048_576 }),
  );

  await app.register(helmet);
  app.enableCors({ origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()) });
  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`API démarrée sur le port ${env.PORT}`, 'Bootstrap');
}

bootstrap();
