import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { AccountDeletionService } from './account-deletion.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [UsersController],
  providers: [UsersService, AccountDeletionService],
})
export class UsersModule {}
