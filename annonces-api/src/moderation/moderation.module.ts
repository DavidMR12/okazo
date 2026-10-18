import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { ModerationAdminController } from './moderation-admin.controller';
import { ModerationAdminService } from './moderation-admin.service';
import { ModerationQueue } from './moderation.queue';
import { ModerationService } from './moderation.service';
import { RulesService } from './rules.service';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [ModerationAdminController],
  providers: [ModerationService, ModerationQueue, ModerationAdminService, RulesService],
  exports: [ModerationQueue],
})
export class ModerationModule {}
