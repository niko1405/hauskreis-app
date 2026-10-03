import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { RecapAnnouncer } from './recap-announcer.service';

/**
 * Nur die Nachricht „die Zusammenfassung ist da".
 *
 * Ein eigenes Modul, weil sie an zwei Stellen geschrieben wird: an der
 * Nachbereitung eines Abends (`MeetingModule`) und an der Einheit eines Themas
 * (`TopicModule`). Ohne Kante zu einem der beiden — dieselbe Bauart wie
 * `TopicLinkModule`, und aus demselben Grund: Eine Kante zwischen Terminen und
 * Themen hat den Modulgraphen schon einmal in einen Zyklus geführt. Prisma und
 * die Uhr der Gruppe sind `@Global`.
 */
@Module({
  imports: [NotificationModule],
  providers: [RecapAnnouncer],
  exports: [RecapAnnouncer],
})
export class RecapModule {}
