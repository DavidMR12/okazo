import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PhoneRequiredGuard } from '../auth/guards/phone-required.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OffersService } from './offers.service';

const makeSchema = z.object({
  amountXaf: z.number().int('Montant en francs CFA, sans centimes.').positive('Indiquez un montant.').max(10_000_000_000),
  message: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(1000, 'Message trop long (1 000 caractères maximum).'))
    .optional()
    .transform((s) => s || undefined),
});
type MakeInput = z.infer<typeof makeSchema>;

/** « Faire une offre » : l'acheteur propose un prix, le vendeur accepte ou refuse, l'acheteur peut retirer. */
@Controller()
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Post('listings/:id/offers')
  @UseGuards(PhoneRequiredGuard) // numéro vérifié obligatoire pour agir
  make(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(makeSchema)) body: MakeInput) {
    return this.offers.make(user.id, id, body.amountXaf, body.message);
  }

  @Post('offers/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.respond(user.id, id, 'accept');
  }

  @Post('offers/:id/decline')
  @HttpCode(HttpStatus.OK)
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.respond(user.id, id, 'decline');
  }

  @Post('offers/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.respond(user.id, id, 'withdraw');
  }
}
