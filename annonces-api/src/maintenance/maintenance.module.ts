import { Module } from '@nestjs/common';
import { MaintenanceQueue } from './maintenance.queue';

@Module({ providers: [MaintenanceQueue] })
export class MaintenanceModule {}
