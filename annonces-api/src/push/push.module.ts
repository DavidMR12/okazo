import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { env } from '../config/env';
import { ConsolePushSender, FcmPushSender, NoPushSender, PUSH_SENDER } from './push-sender';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/** Global : la messagerie, la modération et les offres préviennent par PushService. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [PushController],
  providers: [
    PushService,
    {
      provide: PUSH_SENDER,
      useFactory: () =>
        env.PUSH_PROVIDER === 'fcm' ? new FcmPushSender() : env.PUSH_PROVIDER === 'console' ? new ConsolePushSender() : new NoPushSender(),
    },
  ],
  exports: [PushService],
})
export class PushModule {}
