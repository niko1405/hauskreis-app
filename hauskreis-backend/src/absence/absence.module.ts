import { Module } from '@nestjs/common';
import { AbsenceController } from './absence.controller';
import { AbsenceService } from './absence.service';
import { AbsenceSyncService } from './absence-sync.service';
import { PersonModule } from '../person/person.module';
import { MeetingModule } from '../meeting/meeting.module';

/**
 * Absence periods and the evening-level answers derived from them.
 *
 * Imports `MeetingModule` for the notification side: a holiday produces
 * ordinary drop-outs, so the host is told and a small home may be offered the
 * evening — all of that already existed and is reused rather than rebuilt.
 */
@Module({
  imports: [PersonModule, MeetingModule],
  controllers: [AbsenceController],
  providers: [AbsenceService, AbsenceSyncService],
  exports: [AbsenceSyncService],
})
export class AbsenceModule {}
