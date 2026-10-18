import { Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CartService } from './cart.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  // PUT (et non POST) : idempotent, rejouable sans risque sur réseau instable
  @Put('cart/:listingId')
  add(@CurrentUser() user: AuthUser, @Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.cart.add(user.id, listingId);
  }

  @Delete('cart/:listingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.cart.remove(user.id, listingId);
  }

  @Get('me/cart')
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() user: AuthUser) {
    return this.cart.list(user.id);
  }

  @Get('me/cart/ids')
  @Header('Cache-Control', 'private, no-store')
  ids(@CurrentUser() user: AuthUser) {
    return this.cart.ids(user.id);
  }
}
