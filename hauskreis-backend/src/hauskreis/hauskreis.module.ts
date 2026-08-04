import { Module } from '@nestjs/common';
import { HauskreisController } from './hauskreis.controller';
import { HauskreisService } from './hauskreis.service';
import { MembershipService } from './membership.service';
import { InvitationController } from './invitation.controller';
import { PersonModule } from '../person/person.module';

/**
 * PersonModule: wer einen Hauskreis verlässt, gibt seine Wohnung frei — den
 * Namen der Wohnung zieht `PersonService.syncHomes` nach.
 */
@Module({
  imports: [PersonModule],
  controllers: [HauskreisController, InvitationController],
  providers: [HauskreisService, MembershipService],
  exports: [HauskreisService, MembershipService],
})
export class HauskreisModule {}
