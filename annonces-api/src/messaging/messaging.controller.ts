import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PhoneRequiredGuard } from '../auth/guards/phone-required.guard';
import { Roles } from '../auth/guards/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  ConversationQuery,
  conversationQuery,
  inboxQuery,
  ReportConversationInput,
  reportConversationSchema,
  SendMessageInput,
  sendMessageSchema,
  StartConversationInput,
  startConversationSchema,
} from './messaging.schemas';
import { MessagingService } from './messaging.service';

const PRIVATE = 'private, no-store';

@Controller()
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Post('conversations')
  @UseGuards(PhoneRequiredGuard) // numéro vérifié obligatoire pour agir
  start(@CurrentUser() u: AuthUser, @Body(new ZodValidationPipe(startConversationSchema)) b: StartConversationInput) {
    return this.messaging.start(u.id, b.listingId, b.body);
  }

  @Get('conversations')
  @Header('Cache-Control', PRIVATE)
  inbox(@CurrentUser() u: AuthUser, @Query(new ZodValidationPipe(inboxQuery)) q: z.infer<typeof inboxQuery>) {
    return this.messaging.inbox(u.id, q.cursor);
  }

  @Get('conversations/unread-count')
  @Header('Cache-Control', PRIVATE)
  unread(@CurrentUser() u: AuthUser) {
    return this.messaging.unreadCount(u.id);
  }

  @Get('conversations/with-listing/:listingId')
  @Header('Cache-Control', PRIVATE)
  withListing(@CurrentUser() u: AuthUser, @Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.messaging.withListing(u.id, listingId);
  }

  @Get('conversations/:id')
  @Header('Cache-Control', PRIVATE)
  open(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(conversationQuery)) q: ConversationQuery) {
    return this.messaging.open(u.id, id, q);
  }

  @Post('conversations/:id/messages')
  @UseGuards(PhoneRequiredGuard) // numéro vérifié obligatoire pour agir
  send(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(sendMessageSchema)) b: SendMessageInput) {
    return this.messaging.send(u.id, id, b.body);
  }

  @Post('conversations/:id/report')
  @HttpCode(HttpStatus.OK)
  report(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(reportConversationSchema)) b: ReportConversationInput) {
    return this.messaging.report(u.id, id, b);
  }

  @Post('users/:id/block')
  @HttpCode(HttpStatus.OK)
  block(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.block(u.id, id);
  }

  @Delete('users/:id/block')
  unblock(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.unblock(u.id, id);
  }

  @Get('admin/conversations/:id')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @Header('Cache-Control', PRIVATE)
  forModeration(@Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.forModeration(id);
  }
}
