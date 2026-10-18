import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/guards/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  pendingQuery,
  ReviewVerificationInput,
  reviewVerificationSchema,
  SubmitVerificationInput,
  submitVerificationSchema,
  VerificationUploadUrlsInput,
  verificationUploadUrlsSchema,
} from './verifications.schemas';
import { VerificationsService } from './verifications.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class VerificationsController {
  constructor(private readonly verifications: VerificationsService) {}

  @Post('verifications/upload-urls')
  @HttpCode(HttpStatus.OK)
  uploadUrls(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(verificationUploadUrlsSchema)) body: VerificationUploadUrlsInput) {
    return this.verifications.uploadUrls(user.id, body);
  }

  @Post('verifications')
  submit(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(submitVerificationSchema)) body: SubmitVerificationInput) {
    return this.verifications.submit(user.id, body);
  }

  @Get('me/verification')
  @Header('Cache-Control', 'private, no-store')
  status(@CurrentUser() user: AuthUser) {
    return this.verifications.status(user.id);
  }

  @Get('admin/verifications')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @Header('Cache-Control', 'private, no-store')
  pending(@Query(new ZodValidationPipe(pendingQuery)) q: z.infer<typeof pendingQuery>) {
    return this.verifications.pending(q.limit);
  }

  @Post('admin/verifications/:userId/review')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @HttpCode(HttpStatus.OK)
  review(
    @CurrentUser() reviewer: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(reviewVerificationSchema)) body: ReviewVerificationInput,
  ) {
    return this.verifications.review(reviewer, userId, body);
  }
}
