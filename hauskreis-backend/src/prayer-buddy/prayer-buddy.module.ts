import { Module } from '@nestjs/common';
import { PrayerBuddyController } from './prayer-buddy.controller';
import { PrayerBuddyService } from './prayer-buddy.service';
import { PrayerBuddyGeneratorService } from './prayer-buddy-generator.service';
import { NotificationModule } from '../notification/notification.module';

/**
 * Prayer buddies. Deliberately outside the role suggestion engine: that one
 * answers "one person per slot", this is a pairing problem with a different
 * shape (Architektur-Prinzip 4).
 */
@Module({
  imports: [NotificationModule],
  controllers: [PrayerBuddyController],
  providers: [PrayerBuddyService, PrayerBuddyGeneratorService],
  exports: [PrayerBuddyService, PrayerBuddyGeneratorService],
})
export class PrayerBuddyModule {}
