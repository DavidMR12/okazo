import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { VerificationsController } from './verifications.controller';
import { VerificationsService } from './verifications.service';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [VerificationsController],
  providers: [VerificationsService],
})
export class VerificationsModule {}
