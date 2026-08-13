import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationPreferenceService } from '../notification/notification-preference.service';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';
import { GroupClockService } from './group-clock.service';
import {
  actionstepOf,
  actionstepSelect,
  hasActionstep,
} from './actionstep-source';
import { appPath } from '../notification/app-paths';
import { CRON_TIME_ZONE } from '../common/time/local-evening';

export interface ActionstepRunResult {
  /** People who got a fresh nudge. */
  notified: number;
  /**
   * Already nudged, switched off, or push is off.
   *
   * People whose weekday it is not, and people who have already ticked the
   * step off, never enter the run at all and are not counted here.
   */
  skipped: number;
  /** The meeting the actionstep came from, if there was one. */
  meetingId: string | null;
}

/**
 * Nudges everyone mid-week about the actionstep from the last meeting.
 *
 * **Why the job runs daily although the reminder is weekly.** The weekday is a
 * personal setting, so there is no single day to run on. The job asks every
 * morning whether today is *your* day — one cron for the group instead of one
 * per person, and changing the setting takes effect the next morning without
 * rescheduling anything.
 *
 * **Which actionstep.** The most recent past meeting that has one. Not "the
 * last meeting": if nobody wrote an actionstep last week, last week is silent
 * rather than the week before being repeated — the whole point is the step the
 * group actually agreed on, and re-sending a fortnight-old one reads as a bug.
 *
 * Deduplication is per meeting, so the nudge goes out once per actionstep even
 * though the job runs every day and the meeting stays "the most recent" for a
 * week.
 */
@Injectable()
export class ActionstepReminderService {
  private readonly logger = new Logger(ActionstepReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly preferences: NotificationPreferenceService,
    private readonly clock: GroupClockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'actionstep-reminders',
    timeZone: CRON_TIME_ZONE,
  })
  async handleCron(): Promise<void> {
    const hauskreise = await this.prisma.hauskreis.findMany({
      select: { id: true },
    });

    await Promise.all(
      hauskreise.map((hauskreis) => this.sendDueReminders(hauskreis.id)),
    );
  }

  async sendDueReminders(
    hauskreisId: string,
    options: { now?: Date } = {},
  ): Promise<ActionstepRunResult> {
    const now = options.now ?? new Date();
    const today = await this.clock.today(hauskreisId, now);

    const meeting = await this.prisma.meeting.findFirst({
      where: {
        hauskreisId,
        date: { lt: today },
        status: { not: MeetingStatus.CANCELLED },
        // Aus beiden Quellen: der Einheit eines Themas und der Nachbereitung des
        // Abends selbst. Welche gilt, entscheidet `actionstepOf`.
        ...hasActionstep,
      },
      orderBy: { date: 'desc' },
      select: { id: true, ...actionstepSelect },
    });

    const actionstep = meeting && actionstepOf(meeting);

    if (!meeting || !actionstep) {
      return { notified: 0, skipped: 0, meetingId: null };
    }

    const people = await this.prisma.person.findMany({
      where: { hauskreisId, active: true },
      select: { id: true },
    });

    const [settings, alreadyDone] = await Promise.all([
      this.preferences.resolveMany(
        people.map((person) => person.id),
        NotificationType.ACTIONSTEP_REMINDER,
      ),
      this.prisma.meetingActionstepDone.findMany({
        where: { meetingId: meeting.id },
        select: { personId: true },
      }),
    ]);

    // Wer abgehakt hat, wird nicht mehr gefragt, wie es läuft. Genau dafür ist
    // der Haken da — sonst wäre er nur Statistik.
    const done = new Set(alreadyDone.map((row) => row.personId));

    const weekday = today.getUTCDay();
    const due = people.filter(
      (person) =>
        !done.has(person.id) &&
        settings.get(person.id)?.weekdays.includes(weekday),
    );

    const results = await Promise.all(
      due.map((person) =>
        this.notifications.notify({
          personId: person.id,
          type: NotificationType.ACTIONSTEP_REMINDER,
          relatedMeetingId: meeting.id,
          payload: {
            title: 'Dein Actionstep',
            body: `Wie läuft es damit? "${actionstep}"`,
            url: appPath.meeting(meeting.id),
          },
        }),
      ),
    );

    const outcome = results.reduce(
      (total, result) => ({
        notified: total.notified + (result.skipped === 0 ? 1 : 0),
        skipped: total.skipped + result.skipped,
      }),
      { notified: 0, skipped: 0 },
    );

    if (outcome.notified > 0) {
      this.logger.log(`Sent ${outcome.notified} actionstep reminder(s)`);
    }

    return { ...outcome, meetingId: meeting.id };
  }
}
