import { env } from '../../config/env';
import { SmsProvider } from './sms-provider';

/**
 * Infobip (fournisseur retenu le 7 novembre 2026) : API « SMS advanced ».
 * INFOBIP_BASE_URL est l'adresse propre au compte (https://xxxxx.api.infobip.com), vérifiée au démarrage.
 */
export class InfobipSmsProvider implements SmsProvider {
  async send(toE164: string, message: string): Promise<void> {
    const res = await fetch(`${env.INFOBIP_BASE_URL}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        Authorization: `App ${env.INFOBIP_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        messages: [{ from: env.INFOBIP_SENDER, destinations: [{ to: toE164.replace(/^\+/, '') }], text: message }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Échec d'envoi SMS (HTTP ${res.status})`);
    // Une réponse 200 peut contenir un message refusé (numéro invalide, expéditeur non autorisé…)
    const data = (await res.json().catch(() => null)) as { messages?: { status?: { groupName?: string } }[] } | null;
    const group = data?.messages?.[0]?.status?.groupName;
    if (group === 'REJECTED' || group === 'UNDELIVERABLE') throw new Error(`SMS refusé par Infobip (${group})`);
  }
}
