import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AutoAttendanceService } from '../attendance/auto-attendance.service';
import { MeetingStatus, MeetingType } from '../../generated/prisma/enums';
import { isLastOfMonth, upcomingWeekdays } from './meeting-schedule';
import { GroupClockService } from './group-clock.service';
import { MeetingScheduleConfigService } from './meeting-schedule-config.service';
import { slotDefaults } from './meeting-slots';

/** How many future meetings should always be available for planning. */
export const MEETINGS_AHEAD = 7;

export interface GenerationResult {
  created: number;
  skipped: number;
}

@Injectable()
export class MeetingGeneratorService {
  private readonly logger = new Logger(MeetingGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly autoAttendance: AutoAttendanceService,
    private readonly schedule: MeetingScheduleConfigService,
    private readonly clock: GroupClockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'generate-meetings' })
  async handleCron(): Promise<void> {
    const [result, closed] = await Promise.all([
      this.generateForAllHauskreise(),
      this.closePastMeetings(),
    ]);

    if (result.created > 0) {
      this.logger.log(
        `Generated ${result.created} meeting(s), ${result.skipped} date(s) already had one`,
      );
    }

    if (closed > 0) {
      this.logger.log(`Marked ${closed} past meeting(s) as completed`);
    }
  }

  /**
   * Moves evenings that have been and gone from PLANNED to COMPLETED.
   *
   * `COMPLETED` has been in the enum since the meetings were built and nothing
   * ever set it, so the archive listed evenings from months ago as still
   * planned. Nobody is going to tick them off by hand every week.
   *
   * Cancelled ones keep their status: "fiel aus" is a different fact from "hat
   * stattgefunden", and the archive should be able to tell them apart.
   */
  async closePastMeetings(now = new Date()): Promise<number> {
    const result = await this.prisma.meeting.updateMany({
      where: { date: { lt: toUtcDate(now) }, status: MeetingStatus.PLANNED },
      data: { status: MeetingStatus.COMPLETED },
    });

    return result.count;
  }

  async generateForAllHauskreise(now = new Date()): Promise<GenerationResult> {
    const hauskreise = await this.prisma.hauskreis.findMany({
      select: { id: true },
    });

    // Groups are independent of each other, so there is nothing to serialise.
    const results = await Promise.all(
      hauskreise.map(({ id }) => this.generateFor(id, now)),
    );

    return results.reduce<GenerationResult>(
      (total, result) => ({
        created: total.created + result.created,
        skipped: total.skipped + result.skipped,
      }),
      { created: 0, skipped: 0 },
    );
  }

  /**
   * Makes sure the next `MEETINGS_AHEAD` evenings exist as meetings.
   *
   * Wochentag und Uhrzeit kommen aus `MeetingScheduleConfig` — hier stand
   * beides einmal als Konstante, und eine App, die nur Dienstage kennt, ist
   * keine App für Hauskreise. Ein Wechsel des Wochentags verschiebt nichts,
   * was schon steht: der Lauf legt nur an, was fehlt, und die alten Termine
   * laufen aus.
   *
   * Idempotent by design: a date that already has *any* meeting is left
   * untouched, whatever its type. That is what protects a CUSTOM meeting the
   * group created themselves (a birthday, say) from being replaced by a
   * generated standard one.
   *
   * Seit ein besonderer Termin mehrere Tage dauern kann, reicht der Vergleich
   * auf das Startdatum nicht mehr: liegt der Abend **mitten** in einer
   * Freizeit, stünde sonst ein Hauskreis-Abend im Zeltlager.
   */
  async generateFor(
    hauskreisId: string,
    now = new Date(),
  ): Promise<GenerationResult> {
    const rhythm = await this.schedule.getRhythm(hauskreisId);
    // Der Kalendertag der Gruppe, nicht der rohe Zeitpunkt: der Lauf startet um
    // drei Uhr nachts, und in UTC ist das noch der Vortag — `upcomingWeekdays`
    // hätte dann einen Termin für **heute** angelegt statt für nächste Woche.
    const today = await this.clock.today(hauskreisId, now);
    const dates = upcomingWeekdays(today, rhythm.weekday, MEETINGS_AHEAD);
    const last = dates.at(-1) as Date;

    const existing = await this.prisma.meeting.findMany({
      where: {
        hauskreisId,
        date: { lte: last },
        OR: [{ date: { in: dates } }, { endDate: { gte: dates[0] as Date } }],
      },
      select: { date: true, endDate: true },
    });

    const missing = dates.filter(
      (date) =>
        !existing.some(
          (meeting) =>
            meeting.date <= date && (meeting.endDate ?? meeting.date) >= date,
        ),
    );

    if (missing.length === 0) {
      // Trotzdem auffüllen: der Schalter kann angegangen sein, während die
      // Termine schon standen.
      await this.autoAttendance.apply(hauskreisId, { now });
      return { created: 0, skipped: dates.length };
    }

    const result = await this.prisma.meeting.createMany({
      data: missing.map((date) => {
        const type = isLastOfMonth(date)
          ? MeetingType.LOBPREIS_GEBET
          : MeetingType.STANDARD;

        // Bausteine und Uhrzeit kommen aus Terminart und Rhythmus und werden
        // hier ausdrücklich gesetzt statt den Spalten-Defaults überlassen: die
        // stimmen nur für STANDARD um 18 Uhr, und ein Lobpreisabend mit
        // Themen-Slot wäre genau der Zustand, den die Slots abschaffen sollten.
        return {
          hauskreisId,
          date,
          type,
          startMinutes: rhythm.startMinutes,
          ...slotDefaults(type),
        };
      }),
      // Belt and braces against a concurrent run: the unique index on
      // (hauskreis_id, date) is the real guarantee.
      skipDuplicates: true,
    });

    // Wer „ich bin grundsätzlich dabei" eingestellt hat, hat auch für die
    // gerade entstandenen Abende zugesagt.
    await this.autoAttendance.apply(hauskreisId, { now });

    return { created: result.count, skipped: dates.length - result.count };
  }
}
