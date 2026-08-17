import { Module } from '@nestjs/common';
import { HauskreisController } from './hauskreis.controller';
import { HauskreisService } from './hauskreis.service';
import { MembershipService } from './membership.service';
import { InvitationController } from './invitation.controller';
import { PersonModule } from '../person/person.module';
import { PrayerBuddyModule } from '../prayer-buddy/prayer-buddy.module';
import { MeetingModule } from '../meeting/meeting.module';
import { NotificationModule } from '../notification/notification.module';
import { MEMBERSHIP_SERVICE } from './membership.token';

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
  providers: [
    HauskreisService,
    MembershipService,
    // Zusätzlich unter einer Zeichenkette, damit `PersonService.remove` den
    // Dienst nachschlagen kann, ohne die Klasse zu importieren — die
    // Begründung steht in `membership.token.ts`.
    { provide: MEMBERSHIP_SERVICE, useExisting: MembershipService },
  ],
  exports: [HauskreisService, MembershipService, MEMBERSHIP_SERVICE],
})
export class HauskreisModule {}
