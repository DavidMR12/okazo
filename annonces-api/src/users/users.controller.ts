import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UpdateProfileInput, updateProfileSchema } from './users.schemas';
import { AccountDeletionService } from './account-deletion.service';
import { UsersService } from './users.service';

const deleteAccountSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Le code contient 6 chiffres.') });

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly deletion: AccountDeletionService,
  ) {}

  /** Suppression de compte, étape 1 : envoi d'un code SMS de confirmation. */
  @Post('me/delete/request')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  requestDeletion(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest) {
    return this.deletion.requestCode(user.id, req.ip);
  }

  /** Étape 2 : suppression définitive avec le code reçu. */
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(deleteAccountSchema)) body: z.infer<typeof deleteAccountSchema>) {
    return this.deletion.delete(user.id, body.code);
  }

  /** Le profil complet de l'utilisateur connecté reste disponible via GET /auth/me. */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  update(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput) {
    return this.users.updateProfile(user.id, body);
  }

  /** Ses annonces : GET /listings?sellerId=… */
  @Get('users/:id')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300')
  profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.publicProfile(id);
  }
}
