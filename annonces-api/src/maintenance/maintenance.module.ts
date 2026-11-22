import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { MaintenanceQueue } from './maintenance.queue';

@Module({ imports: [PaymentsModule], providers: [MaintenanceQueue] })
export class MaintenanceModule {}
