import { Logger } from '@nestjs/common';
import { env } from '../../config/env';

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

/** Envoi du code de connexion par WhatsApp (moins cher et plus fiable que le SMS dans la zone). */
export interface WhatsAppProvider {
  /** false : canal non configuré (on propose alors le SMS). */
  readonly enabled: boolean;
  sendCode(toE164: string, code: string): Promise<void>;
}

/** Développement uniquement : affiche le message dans les logs au lieu de l'envoyer. */
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  readonly enabled = true;
  private readonly log = new Logger('WhatsApp[dev]');
  async sendCode(toE164: string, code: string): Promise<void> {
    this.log.warn(`→ ${toE164} : ${env.APP_NAME} : votre code est ${code}`);
  }
}

/** Canal désactivé (pas de compte WhatsApp Business configuré). */
export class DisabledWhatsAppProvider implements WhatsAppProvider {
  readonly enabled = false;
  async sendCode(): Promise<void> {
    throw new Error('WhatsApp non configuré');
  }
}

/**
 * API WhatsApp Business Cloud de Meta : modèle de message « authentification » validé par Meta
 * (le code apparaît dans le message et dans le bouton « Copier le code »).
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly enabled = true;
  async sendCode(toE164: string, code: string): Promise<void> {
    const res = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toE164.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: env.WHATSAPP_TEMPLATE,
          language: { code: env.WHATSAPP_TEMPLATE_LANG },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`WhatsApp ${res.status} : ${(await res.text()).slice(0, 200)}`);
  }
}
