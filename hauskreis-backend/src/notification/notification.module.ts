import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { PushSubscriptionService } from './push-subscription.service';
import { PersonModule } from '../person/person.module';

/**
 * Owns everything push-related. Reminder jobs from later phases import this
 * module and inject `NotificationService` rather than talking to `web-push`
 * themselves.
 */
@Module({
  imports: [PersonModule],
  controllers: [NotificationController],
  providers: [NotificationService, PushSubscriptionService],
  exports: [NotificationService],
})
export class NotificationModule {}
