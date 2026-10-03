import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationPreferenceService } from '../notification/notification-preference.service';
import { NotificationType } from '../../generated/prisma/enums';
import { formatShortDate } from '../notification/reminder-copy';
import { appPath } from '../notification/app-paths';
import { CRON_TIME_ZONE, eveningReached } from '../common/time/local-evening';
import { GroupClockService } from './group-clock.service';
import { addDays } from './meeting-schedule';
import { describeRoles } from './meeting-notification.service';
import {
  OPEN_ROLES_SELECT,
  findNextMeetingId,
  openRoles,
  plannedAttendees,
} from './next-meeting';

export interface RoleOpenRunResult {
  notified: number;
  skipped: number;
  meetingId: string | null;
}

/**
 * Wie weit der nächste Abend höchstens entfernt sein darf.
 *
 * Bei vierzehntägigem Takt läge er sonst am Samstag noch zehn Tage vorne, und
 * die Erinnerung käme zweimal für denselben Abend, bevor überhaupt jemand an
 * ihn denkt. Eine Woche ist der Horizont, in dem „ist noch frei" eine Frage ist.
 */
const HORIZON_DAYS = 7;

/**
 * „Für den 4. August ist noch etwas frei."
 *
 * An die, die dabei oder noch unentschieden sind, an den Wochentagen, die
 * jede:r selbst wählt — wie beim Actionstep. Gefragt wird jeden Morgen nach
 * dem **Stand**: Eine Rolle, die seit Montag frei ist, und eine, die gestern
 * durch eine Absage frei wurde, sind dieselbe Nachricht. Die sofortige
 * Meldung bei der Absage selbst (`ATTENDANCE_DECLINED`) bleibt daneben stehen.
 *
 * Entdoppelt je Abend **und Tag** (`relatedKey`): Samstag und Montag sind zwei
 * Erinnerungen, keine doppelte.
 */
@Injectable()
export class RoleOpenReminderService {
  private readonly logger = new Logger(RoleOpenReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly preferences: NotificationPreferenceService,
    private readonly clock: GroupClockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'role-open-reminders',
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
  ): Promise<RoleOpenRunResult> {
    const nothing = { notified: 0, skipped: 0, meetingId: null };
    const now = options.now ?? new Date();
    const today = await this.clock.today(hauskreisId, now);

    const meetingId = await findNextMeetingId(this.prisma, hauskreisId, today);
    if (!meetingId) return nothing;

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        date: true,
        startMinutes: true,
        ...OPEN_ROLES_SELECT,
      },
    });
    if (!meeting) return nothing;

    // Zu weit weg, oder schon angefangen: Wer jetzt noch fehlt, fehlt eben —
    // eine Aufforderung mitten in den Abend hinein hilft niemandem.
    const zone = await this.clock.zoneOf(hauskreisId);
    if (
      meeting.date > addDays(today, HORIZON_DAYS) ||
      eveningReached(meeting.date, zone, now, meeting.startMinutes)
    ) {
      return nothing;
    }

    const what = describeRoles(openRoles(meeting));
    if (!what) return { ...nothing, meetingId: meeting.id };

    const people = await plannedAttendees(this.prisma, hauskreisId, meeting.id);
    const settings = await this.preferences.resolveMany(
      people,
      NotificationType.ROLE_OPEN_REMINDER,
    );

    const weekday = today.getUTCDay();
    const due = people.filter((personId) =>
      settings.get(personId)?.weekdays.includes(weekday),
    );

    const day = formatShortDate(meeting.date);

    const results = await Promise.all(
      due.map((personId) =>
        this.notifications.notify({
          personId,
          type: NotificationType.ROLE_OPEN_REMINDER,
          relatedMeetingId: meeting.id,
          relatedKey: today.toISOString().slice(0, 10),
          payload: {
            title: `Für den ${day} ist noch etwas frei`,
            body: `${what} noch frei. Magst du etwas übernehmen?`,
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
      this.logger.log(
        `Sent ${outcome.notified} „noch frei" push(es) for ${meeting.id}`,
      );
    }

    return { ...outcome, meetingId: meeting.id };
  }
}
