import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationPreferenceService } from '../notification/notification-preference.service';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';
import { toUtcDate } from './meeting-schedule';

export interface ActionstepRunResult {
  /** People who got a fresh nudge. */
  notified: number;
  /** Already nudged, not one of their weekdays, switched off, or push is off. */
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
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'actionstep-reminders' })
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
    const today = toUtcDate(now);

    const meeting = await this.prisma.meeting.findFirst({
      where: {
        hauskreisId,
        date: { lt: today },
        status: { not: MeetingStatus.CANCELLED },
        // An empty string counts as no actionstep: the field is free text and
        // a blank one carries nothing worth interrupting anyone for.
        actionstepText: { not: null },
      },
      orderBy: { date: 'desc' },
      select: { id: true, actionstepText: true },
    });

    if (!meeting || meeting.actionstepText?.trim() === '') {
      return { notified: 0, skipped: 0, meetingId: null };
    }

    const people = await this.prisma.person.findMany({
      where: { hauskreisId, active: true },
      select: { id: true },
    });

    const settings = await this.preferences.resolveMany(
      people.map((person) => person.id),
      NotificationType.ACTIONSTEP_REMINDER,
    );

    const weekday = today.getUTCDay();
    const due = people.filter((person) =>
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
            body: `Wie läuft es damit? "${meeting.actionstepText}"`,
            url: `/meetings/${meeting.id}`,
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
