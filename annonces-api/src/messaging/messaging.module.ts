import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ListingsModule } from '../listings/listings.module';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

@Module({
  imports: [AuthModule, ListingsModule],
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
