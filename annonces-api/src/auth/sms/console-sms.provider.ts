import { Logger } from '@nestjs/common';
import { SmsProvider } from './sms-provider';

/** Développement uniquement : affiche le SMS dans les logs au lieu de l'envoyer. */
export class ConsoleSmsProvider implements SmsProvider {
  private readonly log = new Logger('SMS[dev]');

  async send(toE164: string, message: string): Promise<void> {
    this.log.warn(`→ ${toE164} : ${message}`);
  }
}
