import { env } from '../../config/env';
import { SmsProvider } from './sms-provider';

/**
 * Exemple d'implémentation (API REST Twilio). À remplacer par le fournisseur
 * retenu après vérification de sa couverture au Cameroun, Gabon et Congo.
 */
export class TwilioSmsProvider implements SmsProvider {
  async send(toE164: string, message: string): Promise<void> {
    const sid = env.TWILIO_ACCOUNT_SID!;
    const token = env.TWILIO_AUTH_TOKEN!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toE164, From: env.TWILIO_FROM!, Body: message }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Échec d'envoi SMS (HTTP ${res.status})`);
  }
}
