import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationPreferenceService } from '../notification/notification-preference.service';
import { NotificationType } from '../../generated/prisma/enums';
import { GroupClockService } from './group-clock.service';
import { latestActionstep } from './actionstep-source';
import { appPath } from '../notification/app-paths';
import { CRON_TIME_ZONE } from '../common/time/local-evening';
import { GroupFeaturesService } from '../hauskreis/group-features.service';

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
 * **Welcher Actionstep.** Der von `latestActionstep` — genau derselbe, den auch
 * der Startbildschirm zeigt. Ein leerer Abend beendet den Vorsatz von davor;
 * nur ein besonderer Termin ohne Actionstep wird übersprungen. Warum, steht bei
 * der Funktion.
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
    private readonly features: GroupFeaturesService,
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
    // Der Actionstep der Woche ist abschaltbar, und dann ist er ganz aus: keine
    // Karte auf „Heute" und keine Erinnerung. Beides an einem Schalter, sonst
    // hätte man ihn weggeräumt und bekäme mittwochs trotzdem eine Nachricht.
    if (!(await this.features.weeklyActionstep(hauskreisId))) {
      return { notified: 0, skipped: 0, meetingId: null };
    }

    const now = options.now ?? new Date();
    const today = await this.clock.today(hauskreisId, now);

    const meeting = await latestActionstep(this.prisma, hauskreisId, today);

    if (!meeting) {
      return { notified: 0, skipped: 0, meetingId: null };
    }

    const actionstep = meeting.text;

    const people = await this.prisma.person.findMany({
      where: { hauskreisId, active: true },
      select: { id: true },
    });

    const settings = await this.preferences.resolveMany(
      people.map((person) => person.id),
      NotificationType.ACTIONSTEP_REMINDER,
    );

    // Wer abgehakt hat, wird nicht mehr gefragt, wie es läuft. Genau dafür ist
    // der Haken da — sonst wäre er nur Statistik. Die Haken kommen mit dem
    // Abend, `latestActionstep` liest sie ohnehin mit.
    const done = new Set(meeting.actionstepDone.map((row) => row.personId));

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
