import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ListingsModule } from '../listings/listings.module';
import { SearchesController } from './searches.controller';
import { SearchesService } from './searches.service';

@Module({
  imports: [AuthModule, ListingsModule],
  controllers: [SearchesController],
  providers: [SearchesService],
})
export class SearchesModule {}
