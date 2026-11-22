import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PhoneRequiredGuard } from '../auth/guards/phone-required.guard';
import { RateLimitService } from '../common/rate-limit.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PaymentsService } from './payments.service';

const boostSchema = z.object({ days: z.number().int().min(1).max(90) });
type BoostInput = z.infer<typeof boostSchema>;

@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly limits: RateLimitService,
  ) {}

  /** Offres « À la une » et disponibilité du paiement dans le pays. */
  @Get('boosts/offers')
  offers(@Query('country') country?: string) {
    return this.payments.offers(typeof country === 'string' ? country.toUpperCase().slice(0, 2) : undefined);
  }

  @Post('listings/:id/boost')
  @UseGuards(JwtAuthGuard, PhoneRequiredGuard)
  async boost(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(boostSchema)) body: BoostInput) {
    await this.limits.hit(`rl:boost:${user.id}`, 10, 3600);
    return this.payments.startBoost(user.id, id, body.days);
  }

  @Get('payments/:id')
  @UseGuards(JwtAuthGuard)
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.limits.hit(`rl:payment-read:${user.id}`, 120, 3600);
    return this.payments.get(user.id, id);
  }

  /**
   * Notification de pawaPay (adresse à déclarer dans le tableau de bord pawaPay : https://api.okazo.org/payments/pawapay/callback).
   * Toujours 200 (sinon pawaPay renvoie 8 fois) ; le contenu n'est qu'un signal, voir PaymentsService.onNotification.
   */
  @Post('payments/pawapay/callback')
  @HttpCode(HttpStatus.OK)
  async callback(@Body() body: unknown, @Req() req: FastifyRequest) {
    await this.limits.hit(`rl:pawapay-callback:${req.ip}`, 600, 3600);
    const id = body && typeof body === 'object' ? (body as Record<string, unknown>).depositId : undefined;
    void this.payments.onNotification(id); // traitement après la réponse : pawaPay attend 30 s au plus
    return { received: true };
  }
}
