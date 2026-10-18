import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/guards/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  AdminReportsQuery,
  adminReportsQuery,
  CreateReportInput,
  createReportSchema,
  ResolveReportInput,
  resolveReportSchema,
} from './reports.schemas';
import { ReportsService } from './reports.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('reports')
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createReportSchema)) body: CreateReportInput) {
    return this.reports.create(user.id, body);
  }

  @Get('admin/reports')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  list(@Query(new ZodValidationPipe(adminReportsQuery)) q: AdminReportsQuery) {
    return this.reports.list(q);
  }

  @Post('admin/reports/:id/resolve')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @HttpCode(HttpStatus.OK)
  resolve(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveReportSchema)) body: ResolveReportInput,
  ) {
    return this.reports.resolve(actor, id, body);
  }
}
