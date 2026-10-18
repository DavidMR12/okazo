import { Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FavoritesService } from './favorites.service';

const listQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller()
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  // PUT (et non POST) : l'opération est idempotente, le client peut la rejouer sans risque sur réseau instable
  @Put('favorites/:listingId')
  add(@CurrentUser() user: AuthUser, @Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.favorites.add(user.id, listingId);
  }

  @Delete('favorites/:listingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.favorites.remove(user.id, listingId);
  }

  @Get('me/favorites')
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.favorites.list(user.id, q.cursor, q.limit);
  }

  @Get('me/favorites/ids')
  @Header('Cache-Control', 'private, no-store')
  ids(@CurrentUser() user: AuthUser) {
    return this.favorites.ids(user.id);
  }
}
