import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/guards/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { IssueSanctionInput, issueSanctionSchema } from './sanctions.schemas';

const phoneQuery = z.object({ phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Numéro au format +237…') });
import { SanctionsService } from './sanctions.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('moderator', 'admin')
export class SanctionsController {
  constructor(private readonly sanctions: SanctionsService) {}

  @Post('sanctions')
  issue(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(issueSanctionSchema)) body: IssueSanctionInput) {
    return this.sanctions.issueStandalone(actor, body);
  }

  @Post('sanctions/:id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sanctions.revoke(actor, id);
  }

  @Get('users')
  findByPhone(@Query(new ZodValidationPipe(phoneQuery)) q: z.infer<typeof phoneQuery>) {
    return this.sanctions.findByPhone(q.phone);
  }

  @Get('users/:id')
  user(@Param('id', ParseUUIDPipe) id: string) {
    return this.sanctions.userSummary(id);
  }
}
