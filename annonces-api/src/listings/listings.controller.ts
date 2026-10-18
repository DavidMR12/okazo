import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PhoneRequiredGuard } from '../auth/guards/phone-required.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  CreateListingInput,
  createListingSchema,
  ListQuery,
  listQuerySchema,
  UpdateListingInput,
  updateListingSchema,
} from './listings.schemas';
import { ListingsService } from './listings.service';

// Lectures publiques : courte mise en cache côté CDN (Cloudflare) pour absorber le trafic anonyme.
const PUBLIC_LIST_CACHE = 'public, max-age=15, s-maxage=30, stale-while-revalidate=60';
const PUBLIC_DETAIL_CACHE = 'public, max-age=30, s-maxage=60, stale-while-revalidate=120';
const PRIVATE = 'private, no-store';

const popularQuery = z.object({
  country: z.string().length(2).transform((s) => s.toUpperCase()),
  limit: z.coerce.number().int().min(1).max(12).default(6),
});

@Controller()
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get('listings')
  @Header('Cache-Control', PUBLIC_LIST_CACHE)
  list(@Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery) {
    return this.listings.list(q);
  }

  /** Nombre de résultats (bouton « Voir les N annonces » de l'écran Filtres). */
  @Get('listings/count')
  @Header('Cache-Control', PUBLIC_LIST_CACHE)
  async count(@Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery) {
    return { count: await this.listings.count(q) };
  }

  // Route statique : Fastify la sert avant listings/:id quel que soit l'ordre de déclaration
  /** « Catégories populaires » de l'accueil : catégories principales les plus fournies du pays, avec une photo récente. */
  @Get('categories/popular')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600')
  popular(@Query(new ZodValidationPipe(popularQuery)) q: { country: string; limit: number }) {
    return this.listings.popularCategories(q.country, q.limit);
  }

  @Get('listings/sitemap')
  @Header('Cache-Control', 'public, max-age=600, s-maxage=3600')
  sitemap() {
    return this.listings.sitemap();
  }

  @Get('listings/:id')
  @Header('Cache-Control', PUBLIC_DETAIL_CACHE)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.listings.detail(id);
  }

  @Post('listings')
  @UseGuards(JwtAuthGuard, PhoneRequiredGuard)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createListingSchema)) body: CreateListingInput) {
    return this.listings.create(user.id, body);
  }

  @Patch('listings/:id')
  @UseGuards(JwtAuthGuard, PhoneRequiredGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateListingSchema)) body: UpdateListingInput,
  ) {
    return this.listings.update(user.id, id, body);
  }

  @Post('listings/:id/mark-sold')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  markSold(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.markSold(user.id, id);
  }

  @Delete('listings/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.remove(user.id, id);
  }

  @Get('listings/:id/contact')
  @UseGuards(JwtAuthGuard, PhoneRequiredGuard)
  @Header('Cache-Control', PRIVATE)
  contact(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.contact(user.id, id);
  }

  @Get('me/listings/:id')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', PRIVATE)
  mineDetail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.mineDetail(user.id, id);
  }

  @Get('me/listings')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', PRIVATE)
  mine(@CurrentUser() user: AuthUser) {
    return this.listings.mine(user.id);
  }
}
