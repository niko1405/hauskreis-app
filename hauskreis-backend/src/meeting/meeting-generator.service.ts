import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AutoAttendanceService } from '../attendance/auto-attendance.service';
import { MeetingStatus, MeetingType } from '../../generated/prisma/enums';
import {
  isLastTuesdayOfMonth,
  toUtcDate,
  upcomingTuesdays,
} from './meeting-schedule';

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
   * Makes sure the next `MEETINGS_AHEAD` Tuesdays exist as meetings.
   *
   * Idempotent by design: a date that already has *any* meeting is left
   * untouched, whatever its type. That is what protects a CUSTOM meeting the
   * group created themselves (a birthday, say) from being replaced by a
   * generated standard one.
   */
  async generateFor(
    hauskreisId: string,
    now = new Date(),
  ): Promise<GenerationResult> {
    const dates = upcomingTuesdays(now, MEETINGS_AHEAD);

    const existing = await this.prisma.meeting.findMany({
      where: { hauskreisId, date: { in: dates } },
      select: { date: true },
    });

    const taken = new Set(existing.map((meeting) => meeting.date.getTime()));
    const missing = dates.filter((date) => !taken.has(date.getTime()));

    if (missing.length === 0) {
      // Trotzdem auffüllen: der Schalter kann angegangen sein, während die
      // Termine schon standen.
      await this.autoAttendance.apply(hauskreisId, { now });
      return { created: 0, skipped: dates.length };
    }

    const result = await this.prisma.meeting.createMany({
      data: missing.map((date) => ({
        hauskreisId,
        date,
        type: isLastTuesdayOfMonth(date)
          ? MeetingType.LOBPREIS_GEBET
          : MeetingType.STANDARD,
      })),
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
