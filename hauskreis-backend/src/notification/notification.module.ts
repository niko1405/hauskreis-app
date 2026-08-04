import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { PushSubscriptionService } from './push-subscription.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { MeetingReminderService } from './meeting-reminder.service';
import { RoleAssignmentNotifier } from './role-assignment-notifier.service';
import { PersonModule } from '../person/person.module';

/**
 * Owns everything push-related. Reminder jobs from later phases import this
 * module and inject `NotificationService` rather than talking to `web-push`
 * themselves.
 */
@Module({
  imports: [PersonModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    PushSubscriptionService,
    NotificationPreferenceService,
    MeetingReminderService,
    RoleAssignmentNotifier,
  ],
  // The preference service is exported too: the reminder jobs need the lead
  // time or weekday before they can work out whether today is the day. The
  // meeting reminder runner is what host/topic/song reminders are built on.
  exports: [
    NotificationService,
    NotificationPreferenceService,
    MeetingReminderService,
    // Termin, Thema und Lieder liegen in drei Modulen, die Zuteilung passiert
    // also an drei Stellen — die Regeln dafür stehen trotzdem nur einmal.
    RoleAssignmentNotifier,
  ],
})
export class NotificationModule {}
