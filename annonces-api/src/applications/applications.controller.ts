import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PhoneRequiredGuard } from '../auth/guards/phone-required.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApplicationsService } from './applications.service';
import { applySchema, ApplyInput, cvUploadSchema, CvUploadInput, mineQuery, statusSchema } from './applications.schemas';

/** Candidatures aux offres d'emploi : le candidat postule, le recruteur les consulte depuis son annonce. */
@Controller()
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post('listings/:id/applications/cv-upload-url')
  @UseGuards(PhoneRequiredGuard) // numéro vérifié obligatoire pour agir
  cvUploadUrl(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(cvUploadSchema)) body: CvUploadInput) {
    return this.applications.cvUploadUrl(user.id, id, body);
  }

  @Post('listings/:id/applications')
  @UseGuards(PhoneRequiredGuard) // numéro vérifié obligatoire pour agir
  apply(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(applySchema)) body: ApplyInput) {
    return this.applications.apply(user.id, id, body);
  }

  @Get('me/applications')
  @Header('Cache-Control', 'private, no-store')
  mine(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(mineQuery)) q: { listingId?: string }) {
    return this.applications.mine(user.id, q.listingId);
  }

  @Get('me/listings/:id/applications')
  @Header('Cache-Control', 'private, no-store')
  forListing(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.forListing(user.id, id);
  }

  @Get('me/applications/:id/cv')
  @Header('Cache-Control', 'private, no-store')
  cv(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.cvUrl(user.id, id);
  }

  @Patch('me/applications/:id')
  setStatus(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(statusSchema)) body: { status: 'shortlisted' | 'rejected' | 'viewed' }) {
    return this.applications.setStatus(user.id, id, body.status);
  }
}
