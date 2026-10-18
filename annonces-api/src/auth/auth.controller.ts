import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  RefreshInput,
  refreshSchema,
  RequestOtpInput,
  requestOtpSchema,
  VerifyOtpInput,
  verifyOtpSchema,
  linkIdentitySchema,
  LinkIdentityInput,
  oauthSchema,
  OAuthInput,
  phoneRequestSchema,
  PhoneRequestInput,
  phoneVerifySchema,
  PhoneVerifyInput,
  emailRegisterSchema,
  EmailRegisterInput,
  emailVerifySchema,
  EmailVerifyInput,
  emailLoginSchema,
  EmailLoginInput,
  emailForgotSchema,
  EmailForgotInput,
  emailResetSchema,
  EmailResetInput,
  acceptTermsSchema,
  AcceptTermsInput,
} from './auth.schemas';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.types';
import { CurrentUser } from './guards/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body(new ZodValidationPipe(requestOtpSchema)) body: RequestOtpInput, @Req() req: FastifyRequest) {
    return this.auth.requestOtp(body, req.ip);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body(new ZodValidationPipe(verifyOtpSchema)) body: VerifyOtpInput, @Req() req: FastifyRequest) {
    return this.auth.verifyOtp(body, req.ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    return this.auth.refresh(body);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    return this.auth.logout(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  /** Modes de connexion proposés (boutons Google, Facebook, choix SMS ou WhatsApp). */
  @Get('methods')
  methods() {
    return this.auth.methods();
  }

  // ---- E-mail et mot de passe : inscription (code de confirmation), connexion, mot de passe oublié
  @Post('email/register')
  @HttpCode(HttpStatus.OK)
  emailRegister(@Body(new ZodValidationPipe(emailRegisterSchema)) body: EmailRegisterInput, @Req() req: FastifyRequest) {
    return this.auth.emailRegister(body, req.ip);
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  emailVerify(@Body(new ZodValidationPipe(emailVerifySchema)) body: EmailVerifyInput, @Req() req: FastifyRequest) {
    return this.auth.emailVerify(body, req.ip);
  }

  @Post('email/login')
  @HttpCode(HttpStatus.OK)
  emailLogin(@Body(new ZodValidationPipe(emailLoginSchema)) body: EmailLoginInput, @Req() req: FastifyRequest) {
    return this.auth.emailLogin(body, req.ip);
  }

  @Post('email/forgot')
  @HttpCode(HttpStatus.OK)
  emailForgot(@Body(new ZodValidationPipe(emailForgotSchema)) body: EmailForgotInput, @Req() req: FastifyRequest) {
    return this.auth.emailForgot(body, req.ip);
  }

  @Post('email/reset')
  @HttpCode(HttpStatus.OK)
  emailReset(@Body(new ZodValidationPipe(emailResetSchema)) body: EmailResetInput, @Req() req: FastifyRequest) {
    return this.auth.emailReset(body, req.ip);
  }

  /** Connexion avec Google ou Facebook. */
  @Post('oauth')
  @HttpCode(HttpStatus.OK)
  oauth(@Body(new ZodValidationPipe(oauthSchema)) body: OAuthInput, @Req() req: FastifyRequest) {
    return this.auth.oauthLogin(body, req.ip);
  }
}

/** Compte connecté : numéro à vérifier (compte Google ou Facebook) et comptes liés. */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class AccountLinkController {
  constructor(private readonly auth: AuthService) {}

  @Post('phone/request')
  @HttpCode(HttpStatus.OK)
  requestPhone(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(phoneRequestSchema)) body: PhoneRequestInput, @Req() req: FastifyRequest) {
    return this.auth.requestPhoneLink(user.id, body, req.ip);
  }

  @Post('phone/verify')
  @HttpCode(HttpStatus.OK)
  verifyPhone(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(phoneVerifySchema)) body: PhoneVerifyInput) {
    return this.auth.verifyPhoneLink(user.id, body);
  }

  /** Acceptation des conditions générales d'utilisation (version en vigueur). */
  @Post('terms')
  @HttpCode(HttpStatus.OK)
  acceptTerms(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(acceptTermsSchema)) body: AcceptTermsInput, @Req() req: FastifyRequest) {
    return this.auth.acceptTerms(user.id, body, req.ip);
  }

  @Post('identities')
  @HttpCode(HttpStatus.OK)
  link(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(linkIdentitySchema)) body: LinkIdentityInput) {
    return this.auth.linkIdentity(user.id, body);
  }

  @Delete('identities/:provider')
  unlink(@CurrentUser() user: AuthUser, @Param('provider') provider: string) {
    return this.auth.unlinkIdentity(user.id, provider === 'facebook' ? 'facebook' : 'google');
  }
}
