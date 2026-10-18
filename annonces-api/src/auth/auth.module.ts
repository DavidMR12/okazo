import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RateLimitService } from '../common/rate-limit.service';
import { env } from '../config/env';
import { AccountLinkController, AuthController } from './auth.controller';
import { PhoneRequiredGuard } from './guards/phone-required.guard';
import { HttpOAuthVerifier, OAUTH_VERIFIER } from './oauth/oauth-verifier';
import { ConsoleWhatsAppProvider, DisabledWhatsAppProvider, MetaWhatsAppProvider, WHATSAPP_PROVIDER } from './whatsapp/whatsapp-provider';
import { AuthService } from './auth.service';
import { BlocklistService } from './blocklist.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OtpService } from './otp.service';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { SMS_PROVIDER } from './sms/sms-provider';
import { TwilioSmsProvider } from './sms/twilio-sms.provider';
import { TokenService } from './token.service';
import { EmailCodeService } from './email-code.service';
import { ConsoleMailProvider, DisabledMailProvider, MAIL_PROVIDER } from './mail/mail-provider';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, AccountLinkController],
  providers: [
    AuthService,
    OtpService,
    EmailCodeService,
    { provide: MAIL_PROVIDER, useFactory: () => (env.MAIL_PROVIDER === 'console' ? new ConsoleMailProvider() : new DisabledMailProvider()) },
    TokenService,
    BlocklistService,
    RateLimitService,
    JwtAuthGuard,
    RolesGuard,
    PhoneRequiredGuard,
    { provide: OAUTH_VERIFIER, useClass: HttpOAuthVerifier },
    {
      provide: WHATSAPP_PROVIDER,
      useFactory: () =>
        env.WHATSAPP_PROVIDER === 'meta' ? new MetaWhatsAppProvider() : env.WHATSAPP_PROVIDER === 'console' ? new ConsoleWhatsAppProvider() : new DisabledWhatsAppProvider(),
    },
    {
      provide: SMS_PROVIDER,
      useFactory: () => (env.SMS_PROVIDER === 'twilio' ? new TwilioSmsProvider() : new ConsoleSmsProvider()),
    },
  ],
  // Les autres modules (annonces, modération…) importent AuthModule pour utiliser les gardes.
  exports: [TokenService, JwtAuthGuard, RolesGuard, PhoneRequiredGuard, RateLimitService, OtpService, BlocklistService],
})
export class AuthModule {}
