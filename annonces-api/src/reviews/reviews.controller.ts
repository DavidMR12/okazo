import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PhoneRequiredGuard } from '../auth/guards/phone-required.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createReviewSchema, CreateReviewInput, reportReviewSchema, ReportReviewInput, reviewsQuery } from './reviews.schemas';
import { ReviewsService } from './reviews.service';

/** Avis et notes : donnés depuis une conversation, lus sur le profil public. */
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('users/:id/reviews')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300')
  forUser(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(reviewsQuery)) q: { cursor?: string }) {
    return this.reviews.forUser(id, q.cursor);
  }

  @Get('conversations/:id/review')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.status(user.id, id);
  }

  @Post('conversations/:id/review')
  @UseGuards(JwtAuthGuard, PhoneRequiredGuard)
  create(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(createReviewSchema)) body: CreateReviewInput) {
    return this.reviews.create(user.id, id, body);
  }

  @Post('reviews/:id/report')
  @UseGuards(JwtAuthGuard)
  report(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(reportReviewSchema)) body: ReportReviewInput) {
    return this.reviews.report(user.id, id, body);
  }
}
