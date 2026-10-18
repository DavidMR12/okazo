import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { SearchesModule } from './searches/searches.module';
import { ApplicationsModule } from './applications/applications.module';
import { ReviewsModule } from './reviews/reviews.module';
import { OffersModule } from './offers/offers.module';
import { CategoriesModule } from './categories/categories.module';
import { DbModule } from './db/db.module';
import { FavoritesModule } from './favorites/favorites.module';
import { GeoModule } from './geo/geo.module';
import { HealthController } from './health.controller';
import { ListingsModule } from './listings/listings.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { MediaModule } from './media/media.module';
import { MessagingModule } from './messaging/messaging.module';
import { ModerationModule } from './moderation/moderation.module';
import { RedisModule } from './redis/redis.module';
import { ReportsModule } from './reports/reports.module';
import { SanctionsModule } from './sanctions/sanctions.module';
import { UsersModule } from './users/users.module';
import { VerificationsModule } from './verifications/verifications.module';

@Module({
  imports: [
    DbModule,
    RedisModule,
    CategoriesModule,
    AuthModule,
    GeoModule,
    MediaModule,
    ModerationModule,
    ListingsModule,
    SanctionsModule,
    ReportsModule,
    VerificationsModule,
    UsersModule,
    FavoritesModule,
    CartModule,
    SearchesModule,
    ApplicationsModule,
    ReviewsModule,
    OffersModule,
    MessagingModule,
    MaintenanceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
