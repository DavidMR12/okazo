import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SanctionsController } from './sanctions.controller';
import { SanctionsService } from './sanctions.service';

@Module({
  imports: [AuthModule],
  controllers: [SanctionsController],
  providers: [SanctionsService],
  exports: [SanctionsService],
})
export class SanctionsModule {}
