import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';
import * as schema from './schema';

export const DB = Symbol('DB');
export type Database = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };
/** Transaction Drizzle, pour enchaîner plusieurs services dans une même transaction. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: (): Database =>
        drizzle(postgres(env.DATABASE_URL, { max: 10, idle_timeout: 20 }), { schema }),
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Database) {}

  // Ferme les connexions à l'arrêt : sinon un redémarrage attend qu'elles expirent
  async onApplicationShutdown() {
    await this.db.$client.end({ timeout: 5 });
  }
}
