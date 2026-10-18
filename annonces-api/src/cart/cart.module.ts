import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ListingsModule } from '../listings/listings.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [AuthModule, ListingsModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
