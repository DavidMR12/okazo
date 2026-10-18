import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagingModule } from '../messaging/messaging.module';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

@Module({
  imports: [AuthModule, MessagingModule],
  controllers: [OffersController],
  providers: [OffersService],
})
export class OffersModule {}
