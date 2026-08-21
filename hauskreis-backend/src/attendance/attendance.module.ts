import { Module } from '@nestjs/common';
import { AutoAttendanceService } from './auto-attendance.service';
import { RoleAttendanceService } from './role-attendance.service';

/**
 * Ein Modul für zwei kleine Dienste, und das mit Absicht.
 *
 * Beide schreiben Anwesenheit, ohne dass jemand danach gefragt hätte, und beide
 * werden von überallher angestoßen. Die Zuteilungs-Zusage entsteht am Termin,
 * beim Thema und bei der Musik — drei Module, die einander sonst importieren
 * müssten, um an dieselben zwei Zeilen zu kommen.
 *
 * Die Auto-Zusage wird von drei Seiten angestoßen — vom Termin-Generator, vom
 * Profil und vom Abwesenheits-Abgleich. Läge sie im `MeetingModule`, müsste
 * `PersonModule` dieses importieren; `MeetingModule` importiert aber seinerseits
 * `PersonModule`, und der Kreis wäre da (dieselbe Falle wie bei den
 * Gebetsbuddys). Ein Modul, das außer Prisma nichts braucht, kann jeder
 * importieren.
 */
@Module({
  providers: [AutoAttendanceService, RoleAttendanceService],
  exports: [AutoAttendanceService, RoleAttendanceService],
})
export class AttendanceModule {}
