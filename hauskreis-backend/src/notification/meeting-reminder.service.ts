import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationService,
  type NotificationPayload,
} from './notification.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { notificationDefinition } from './notification-catalog';
import {
  MeetingStatus,
  MeetingType,
  NotificationType,
} from '../../generated/prisma/enums';
// Pure date helpers, no Nest provider involved — importing them across module
// folders costs nothing and beats a second implementation of "same day in UTC".
import { addDays, toUtcDate } from '../meeting/meeting-schedule';

/** What every lead-time reminder gets to look at when picking recipients. */
export interface ReminderMeeting {
  id: string;
  hauskreisId: string;
  date: Date;
  endDate: Date | null;
  type: MeetingType;
  title: string | null;
  hostPersonId: string | null;
  topicId: string | null;
  testimonyPersonId: string | null;
  location: { name: string } | null;
  topic: { title: string | null; responsibles: { personId: string }[] } | null;
  songLeaders: { personId: string }[];
}

export interface ReminderRecipient {
  personId: string;
  payload: NotificationPayload;
}

export interface ReminderRunResult {
  /** People who got a fresh reminder. */
  notified: number;
  /** Already reminded, switched off, or push is not configured. */
  skipped: number;
}

export interface ReminderRunOptions {
  now?: Date;
  hauskreisId?: string;
}

/**
 * Runs the reminders that fire a few days before a meeting.
 *
 * Host, topic and song reminders differ in exactly two things: who they concern
 * and what they say. Everything else — the window to scan, resolving each
 * person's lead time, deduplication, counting the outcome — was identical three
 * times over, so it lives here once (Architektur-Prinzip 3). A fourth reminder
 * of this shape is a `recipients` function, nothing more.
 *
 * **Why a window and not "exactly N days before".** If the server is down on
 * the day a reminder falls due, the next run still catches it, and a host who
 * enters themselves late is not skipped entirely. That only works because
 * `notify()` deduplicates — without the log this would send daily.
 *
 * **Why the window is the widest anyone configured.** Lead times are personal.
 * The scan therefore reaches as far as the most patient setting in the group
 * and each meeting is then filtered against its own recipients' preference.
 * That keeps one daily job for everyone instead of one job per person.
 */
@Injectable()
export class MeetingReminderService {
  private readonly logger = new Logger(MeetingReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly preferences: NotificationPreferenceService,
  ) {}

  async run(
    type: NotificationType,
    recipients: (
      meeting: ReminderMeeting,
    ) => ReminderRecipient[] | Promise<ReminderRecipient[]>,
    options: ReminderRunOptions = {},
  ): Promise<ReminderRunResult> {
    const { schedule } = notificationDefinition(type);

    if (schedule.kind !== 'LEAD_TIME') {
      throw new Error(`${type} is not a lead-time reminder`);
    }

    const today = toUtcDate(options.now ?? new Date());
    const horizon = addDays(today, schedule.maxLeadDays);

    const meetings = await this.prisma.meeting.findMany({
      where: {
        date: { gte: today, lte: horizon },
        status: MeetingStatus.PLANNED,
        // The cron run covers every group; the manual trigger is scoped.
        ...(options.hauskreisId ? { hauskreisId: options.hauskreisId } : {}),
      },
      select: {
        id: true,
        hauskreisId: true,
        date: true,
        endDate: true,
        // Terminart und Titel braucht die Erinnerung an besondere Termine:
        // sie filtert danach und sagt im Text, worum es geht. Die drei
        // Rollen-Erinnerungen lesen sie nicht — ein Feld mehr im `select`
        // kostet weniger als eine zweite Abfrage für einen Sonderfall.
        type: true,
        title: true,
        hostPersonId: true,
        topicId: true,
        testimonyPersonId: true,
        location: { select: { name: true } },
        topic: {
          select: {
            title: true,
            responsibles: { select: { personId: true } },
          },
        },
        songLeaders: { select: { personId: true } },
      },
    });

    // `recipients` darf nachschlagen. Die drei Rollen-Erinnerungen lesen die
    // Empfänger direkt vom Termin ab, aber „alle aktiven Mitglieder" steht
    // nirgends daran — und diese eine Zeile ist billiger, als die
    // Mitgliederlisten aller Hauskreise auf Vorrat zu laden.
    const due = (
      await Promise.all(
        meetings.map(async (meeting) =>
          (await recipients(meeting)).map((recipient) => ({
            meeting,
            recipient,
          })),
        ),
      )
    ).flat();

    const settings = await this.preferences.resolveMany(
      [...new Set(due.map((entry) => entry.recipient.personId))],
      type,
    );

    const results = await Promise.all(
      due
        .filter(({ meeting, recipient }) => {
          const leadDays =
            settings.get(recipient.personId)?.leadDays ??
            // Unreachable in practice; `resolveMany` answers for every id it
            // was given. Falling back to the default is safer than skipping.
            schedule.defaultLeadDays;

          return daysBetween(today, meeting.date) <= leadDays;
        })
        .map(({ meeting, recipient }) =>
          this.notifications.notify({
            personId: recipient.personId,
            type,
            relatedMeetingId: meeting.id,
            payload: recipient.payload,
          }),
        ),
    );

    const outcome = results.reduce<ReminderRunResult>(
      (total, result) => ({
        notified: total.notified + (result.skipped === 0 ? 1 : 0),
        skipped: total.skipped + result.skipped,
      }),
      { notified: 0, skipped: 0 },
    );

    if (outcome.notified > 0) {
      this.logger.log(`Sent ${outcome.notified} ${type} reminder(s)`);
    }

    return outcome;
  }
}

/** Whole days from `from` to `to`; `from` is already midnight UTC. */
function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (toUtcDate(to).getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
  );
}
