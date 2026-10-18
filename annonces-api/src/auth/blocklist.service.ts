import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { blocklist } from '../db/schema';

@Injectable()
export class BlocklistService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async isBlocked(kind: 'phone' | 'device', value: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: blocklist.id })
      .from(blocklist)
      .where(and(eq(blocklist.kind, kind), eq(blocklist.value, value), eq(blocklist.action, 'block')))
      .limit(1);
    return rows.length > 0;
  }

  /** Numéro « à surveiller » (ex. compte supprimé pendant une sanction) : le nouveau compte démarre bridé. */
  async isFlagged(kind: 'phone' | 'device', value: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: blocklist.id })
      .from(blocklist)
      .where(and(eq(blocklist.kind, kind), eq(blocklist.value, value), eq(blocklist.action, 'flag')))
      .limit(1);
    return rows.length > 0;
  }
}
