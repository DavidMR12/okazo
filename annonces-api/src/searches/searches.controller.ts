import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SearchesService } from './searches.service';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120), // résumé lisible préparé par le client (« Toyota · Douala · moins de 5 M »)
  query: z.record(z.union([z.string().max(200), z.number()])).refine((q) => Object.keys(q).length <= 40, 'Trop de filtres.'),
});
type CreateInput = z.infer<typeof createSchema>;

@Controller('me/searches')
@UseGuards(JwtAuthGuard)
export class SearchesController {
  constructor(private readonly searches: SearchesService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() user: AuthUser) {
    return this.searches.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSchema)) body: CreateInput) {
    return this.searches.create(user.id, body.name, body.query);
  }

  @Post(':id/seen')
  @HttpCode(HttpStatus.OK)
  seen(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.searches.markSeen(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.searches.remove(user.id, id);
  }
}
