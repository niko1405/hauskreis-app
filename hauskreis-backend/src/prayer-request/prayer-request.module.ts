import { Module } from '@nestjs/common';
import { PrayerRequestController } from './prayer-request.controller';
import { PrayerRequestService } from './prayer-request.service';
import { PersonModule } from '../person/person.module';

/**
 * Gebetsanliegen an einem Termin.
 *
 * Ein eigenes Modul und nicht ein Anbau an `MeetingModule`: Es hängt zwar an
 * einem Abend, weiß aber von nichts, was einen Abend ausmacht — keine
 * Bausteine, keine Rollen, keine Absagen. Dieselbe Aufteilung wie bei den
 * Liedern, nur andersherum begründet: dort lag es am Lied, hier am wenigen.
 *
 * `PersonModule` für `resolveForUser` — es ist die einzige Abhängigkeit, und
 * sie ist der Grund, dass die Routen ohne Personen-Id auskommen. `PrismaModule`
 * und `ClockModule` sind global.
 */
@Module({
  imports: [PersonModule],
  controllers: [PrayerRequestController],
  providers: [PrayerRequestService],
})
export class PrayerRequestModule {}
