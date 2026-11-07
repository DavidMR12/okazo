import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImageProcessorService } from './image-processor.service';
import { MediaController } from './media.controller';
import { StorageService } from './storage.service';
import { VisualSearchService } from './visual-search.service';

@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [StorageService, ImageProcessorService, VisualSearchService],
  exports: [StorageService, ImageProcessorService, VisualSearchService],
})
export class MediaModule {}
