import { Module } from '@nestjs/common';
import { TopicLinkService } from './topic-link.service';

/**
 * Nur die Verbindung Abend ↔ Einheit, für alle, die sie lösen müssen.
 *
 * Ohne Importe und damit ohne Kanten — dieselbe Bauart wie `EditRightsModule`
 * und aus demselben Grund: `MeetingModule` braucht den Dienst, `TopicModule`
 * ebenso, und eine Kante zwischen den beiden hat den Modulgraphen schon einmal
 * in einen Zyklus geführt.
 */
@Module({
  providers: [TopicLinkService],
  exports: [TopicLinkService],
})
export class TopicLinkModule {}
