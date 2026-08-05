import { Module } from '@nestjs/common';
import { PersonController } from './person.controller';
import { MeController } from './me.controller';
import { PersonService } from './person.service';
import { PhotoController } from './photo.controller';
import { PhotoService } from './photo.service';
import { LocationModule } from '../location/location.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  // Wer ein- oder auszieht, ändert den Namen einer Wohnung — deshalb hängt
  // Person an Location und nicht umgekehrt.
  //
  // `PrayerBuddyModule` steht hier bewusst **nicht**, obwohl `PersonService` es
  // benutzt: die Begründung steht bei `replanPrayerBuddies` in
  // `person.service.ts`.
  //
  // AttendanceModule geht dagegen ohne Umweg: es braucht außer Prisma nichts
  // und schließt deshalb keinen Kreis.
  imports: [LocationModule, AttendanceModule],
  controllers: [PersonController, MeController, PhotoController],
  providers: [PersonService, PhotoService],
  // PhotoService nach außen, damit ein Austritt auch die Datei wegräumt.
  exports: [PersonService, PhotoService],
})
export class PersonModule {}
