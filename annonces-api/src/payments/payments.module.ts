import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { env } from '../config/env';
import { FakeGateway } from './fake.gateway';
import { PawapayGateway } from './pawapay.gateway';
import { PAYMENT_GATEWAY } from './payment-gateway';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_GATEWAY,
      useFactory: () =>
        env.PAYMENT_PROVIDER === 'pawapay' ? new PawapayGateway() : env.PAYMENT_PROVIDER === 'fake' ? new FakeGateway() : null,
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
