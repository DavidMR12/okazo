import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/guards/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ModerationAdminService } from './moderation-admin.service';

const queueQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});
const approveBody = z.object({ note: z.string().max(500).optional() });
const rejectBody = z.object({
  reasonCode: z.string().min(2).max(50).default('MODERATOR_REJECTED'),
  message: z.string().max(300).optional(), // message affiché au vendeur
  note: z.string().max(500).optional(), // note interne
});

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('moderator', 'admin')
export class ModerationAdminController {
  constructor(private readonly admin: ModerationAdminService) {}

  @Get('moderation/queue')
  queue(@Query(new ZodValidationPipe(queueQuery)) q: z.infer<typeof queueQuery>) {
    return this.admin.queue(q.limit, q.offset);
  }

  @Get('listings/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.detail(id);
  }

  @Post('listings/:id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() mod: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveBody)) body: z.infer<typeof approveBody>,
  ) {
    return this.admin.approve(mod.id, id, body.note);
  }

  @Post('listings/:id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() mod: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectBody)) body: z.infer<typeof rejectBody>,
  ) {
    return this.admin.reject(mod.id, id, body);
  }
}
