import { Module } from '@nestjs/common';
import { AutoAttendanceService } from './auto-attendance.service';

/**
 * Ein Modul für einen einzigen Dienst, und das mit Absicht.
 *
 * Die Auto-Zusage wird von drei Seiten angestoßen — vom Termin-Generator, vom
 * Profil und vom Abwesenheits-Abgleich. Läge sie im `MeetingModule`, müsste
 * `PersonModule` dieses importieren; `MeetingModule` importiert aber seinerseits
 * `PersonModule`, und der Kreis wäre da (dieselbe Falle wie bei den
 * Gebetsbuddys). Ein Modul, das außer Prisma nichts braucht, kann jeder
 * importieren.
 */
@Module({
  providers: [AutoAttendanceService],
  exports: [AutoAttendanceService],
})
export class AttendanceModule {}
