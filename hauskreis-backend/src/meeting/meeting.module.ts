import { Module } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { MeetingGeneratorService } from './meeting-generator.service';
import { HostReminderService } from './host-reminder.service';
import { RoleSuggestionModule } from '../role-suggestion/role-suggestion.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  // Both imports are the point of the modular split: the ranking lives in
  // RoleSuggestionModule and the push plumbing in NotificationModule, so this
  // module owns neither.
  imports: [RoleSuggestionModule, NotificationModule],
  controllers: [MeetingController],
  providers: [MeetingService, MeetingGeneratorService, HostReminderService],
  exports: [MeetingService, MeetingGeneratorService, HostReminderService],
})
export class MeetingModule {}
