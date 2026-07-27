import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';
import { addDays, toUtcDate } from './meeting-schedule';

/** How far ahead hosts are reminded — Saturday for the Tuesday meeting. */
export const HOST_REMINDER_DAYS_AHEAD = 3;

export interface ReminderRunResult {
  /** Hosts who got a fresh reminder. */
  notified: number;
  /** Hosts already reminded on an earlier run — or push is not configured. */
  skipped: number;
}

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

@Injectable()
export class HostReminderService {
  private readonly logger = new Logger(HostReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'host-reminders' })
  async handleCron(): Promise<void> {
    const result = await this.sendDueReminders();

    if (result.notified > 0) {
      this.logger.log(`Sent ${result.notified} host reminder(s)`);
    }
  }

  /**
   * Reminds every host whose meeting is within the next few days.
   *
   * Uses a window rather than "exactly in 3 days" on purpose: if the server is
   * down on the day the reminder would fall due, the next run still catches it.
   * That only works because `notify()` deduplicates per (person, type, meeting)
   * — without the log this would send the same reminder three days running.
   */
  async sendDueReminders(
    options: { now?: Date; hauskreisId?: string } = {},
  ): Promise<ReminderRunResult> {
    const today = toUtcDate(options.now ?? new Date());
    const horizon = addDays(today, HOST_REMINDER_DAYS_AHEAD);

    const meetings = await this.prisma.meeting.findMany({
      where: {
        date: { gte: today, lte: horizon },
        status: MeetingStatus.PLANNED,
        hostPersonId: { not: null },
        // The cron run covers every group; the manual trigger is scoped.
        ...(options.hauskreisId ? { hauskreisId: options.hauskreisId } : {}),
      },
      select: {
        id: true,
        date: true,
        hostPersonId: true,
        location: { select: { name: true } },
      },
    });

    const results = await Promise.all(
      meetings.map((meeting) =>
        this.notifications.notify({
          personId: meeting.hostPersonId as string,
          type: NotificationType.HOST_REMINDER,
          relatedMeetingId: meeting.id,
          payload: {
            title: 'Du bist dran mit Hosten',
            body: buildBody(meeting.date, meeting.location?.name ?? null),
            url: `/meetings/${meeting.id}`,
          },
        }),
      ),
    );

    return results.reduce<ReminderRunResult>(
      (total, result) => ({
        notified: total.notified + (result.skipped === 0 ? 1 : 0),
        skipped: total.skipped + result.skipped,
      }),
      { notified: 0, skipped: 0 },
    );
  }
}

/** Warm and personal, per the tone laid out in CLAUDE.md §9. */
function buildBody(date: Date, locationName: string | null): string {
  const when = dateFormat.format(date);

  return locationName
    ? `Am ${when} ist der Hauskreis bei dir (${locationName}).`
    : `Am ${when} ist der Hauskreis bei dir.`;
}
