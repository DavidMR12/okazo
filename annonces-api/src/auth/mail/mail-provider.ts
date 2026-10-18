import { Logger } from '@nestjs/common';

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

/** Envoi des e-mails (code de confirmation d'adresse, mot de passe oublié). */
export interface MailProvider {
  /** false : aucun envoi configuré (la connexion par e-mail n'est alors pas proposée). */
  readonly enabled: boolean;
  send(to: string, subject: string, text: string): Promise<void>;
}

/** Développement uniquement : affiche l'e-mail dans les journaux au lieu de l'envoyer. */
export class ConsoleMailProvider implements MailProvider {
  readonly enabled = true;
  private readonly log = new Logger('Mail[dev]');
  async send(to: string, subject: string, text: string): Promise<void> {
    this.log.warn(`→ ${to} : ${subject} | ${text.replace(/\s+/g, ' ')}`);
  }
}

/** Aucun fournisseur d'e-mail configuré. */
export class DisabledMailProvider implements MailProvider {
  readonly enabled = false;
  async send(): Promise<void> {
    throw new Error('E-mail non configuré');
  }
}
