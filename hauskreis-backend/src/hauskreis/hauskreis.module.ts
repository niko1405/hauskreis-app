import { Module } from '@nestjs/common';
import { HauskreisController } from './hauskreis.controller';
import { HauskreisService } from './hauskreis.service';
import { MembershipService } from './membership.service';
import { InvitationController } from './invitation.controller';
import { PersonModule } from '../person/person.module';
import { PrayerBuddyModule } from '../prayer-buddy/prayer-buddy.module';

/**
 * PersonModule: wer einen Hauskreis verlässt, gibt seine Wohnung frei — den
 * Namen der Wohnung zieht `PersonService.syncHomes` nach.
 *
 * PrayerBuddyModule: und er verlässt damit auch die Gebetsrotation, in der er
 * sonst noch Wochen lang stünde.
 */
@Module({
  imports: [PersonModule, PrayerBuddyModule],
  controllers: [HauskreisController, InvitationController],
  providers: [HauskreisService, MembershipService],
  exports: [HauskreisService, MembershipService],
})
export class HauskreisModule {}
