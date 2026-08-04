import { Module } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { MeetingGeneratorService } from './meeting-generator.service';
import { HostReminderService } from './host-reminder.service';
import { ActionstepReminderService } from './actionstep-reminder.service';
import { MeetingCancellationService } from './meeting-cancellation.service';
import { MeetingNotificationService } from './meeting-notification.service';
import { RoleReleaseService } from './role-release.service';
import { RoleSuggestionModule } from '../role-suggestion/role-suggestion.module';
import { NotificationModule } from '../notification/notification.module';
import { PersonModule } from '../person/person.module';

@Module({
  // Die ersten beiden Importe sind der Sinn des Modul-Schnitts: das Ranking
  // liegt in RoleSuggestionModule, die Push-Verkabelung in NotificationModule,
  // dieses Modul besitzt beides nicht. PersonModule kam für den
  // Actionstep-Haken dazu — wer abhakt, steht im Token und nicht im Body.
  imports: [RoleSuggestionModule, NotificationModule, PersonModule],
  controllers: [MeetingController],
  providers: [
    MeetingService,
    MeetingGeneratorService,
    HostReminderService,
    ActionstepReminderService,
    MeetingNotificationService,
    MeetingCancellationService,
    RoleReleaseService,
  ],
  exports: [
    MeetingService,
    MeetingGeneratorService,
    HostReminderService,
    ActionstepReminderService,
    // For AbsenceModule: a holiday produces ordinary drop-outs, and the host
    // should hear about them exactly as about a manual cancellation.
    MeetingNotificationService,
    // Ebenfalls fürs AbsenceModule: ein Urlaub kann derjenige Ausfall sein, mit
    // dem alle abgesagt haben — dann fällt der Abend aus, ohne dass jemand ihn
    // absagt.
    MeetingCancellationService,
    // Und ebenso: wer wegen Urlaubs ausfällt, gibt Gastgeber und Musik frei.
    RoleReleaseService,
  ],
})
export class MeetingModule {}
