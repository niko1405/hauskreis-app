import { Module } from '@nestjs/common';
import { HauskreisController } from './hauskreis.controller';
import { HauskreisService } from './hauskreis.service';
import { MembershipService } from './membership.service';
import { InvitationController } from './invitation.controller';
import { PersonModule } from '../person/person.module';
import { PrayerBuddyModule } from '../prayer-buddy/prayer-buddy.module';
import { MeetingModule } from '../meeting/meeting.module';
import { NotificationModule } from '../notification/notification.module';

/**
 * Alle vier Importe hängen an einem einzigen Vorgang: dem Verlassen.
 *
 * - **PersonModule** — wer geht, gibt seine Wohnung frei; den Namen der Wohnung
 *   zieht `PersonService.syncHomes` nach.
 * - **PrayerBuddyModule** — und er verlässt die Gebetsrotation, in der er sonst
 *   noch Wochen lang stünde.
 * - **MeetingModule** — seine künftigen Rollen werden frei, und die Abende
 *   danach neu bewertet (`RoleReleaseService`, `MeetingCancellationService`).
 * - **NotificationModule** — die Verbleibenden erfahren davon.
 */
@Module({
  imports: [PersonModule, PrayerBuddyModule, MeetingModule, NotificationModule],
  controllers: [HauskreisController, InvitationController],
  providers: [HauskreisService, MembershipService],
  exports: [HauskreisService, MembershipService],
})
export class HauskreisModule {}
