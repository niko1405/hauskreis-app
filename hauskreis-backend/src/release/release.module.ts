import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { ReleaseController } from './release.controller';
import { ReleaseAnnouncementService } from './release-announcement.service';

/**
 * „Was ist neu" — die Liste selbst und die einmalige Ankündigung dazu.
 *
 * Hängt nur an `NotificationModule`; die Releases stehen als Quelltext in
 * `releases.ts` und brauchen weder Tabelle noch Migration.
 */
@Module({
  imports: [NotificationModule],
  controllers: [ReleaseController],
  providers: [ReleaseAnnouncementService],
  exports: [ReleaseAnnouncementService],
})
export class ReleaseModule {}
