export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsProvider {
  send(toE164: string, message: string): Promise<void>;
}
