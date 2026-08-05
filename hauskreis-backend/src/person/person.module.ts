import { Module } from '@nestjs/common';
import { PersonController } from './person.controller';
import { MeController } from './me.controller';
import { PersonService } from './person.service';
import { LocationModule } from '../location/location.module';

@Module({
  // Wer ein- oder auszieht, ändert den Namen einer Wohnung — deshalb hängt
  // Person an Location und nicht umgekehrt.
  //
  // `PrayerBuddyModule` steht hier bewusst **nicht**, obwohl `PersonService` es
  // benutzt: die Begründung steht bei `replanPrayerBuddies` in
  // `person.service.ts`.
  imports: [LocationModule],
  controllers: [PersonController, MeController],
  providers: [PersonService],
  exports: [PersonService],
})
export class PersonModule {}
