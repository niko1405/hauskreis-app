import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  MeetingReminderService,
  type ReminderRunOptions,
  type ReminderRunResult,
} from '../notification/meeting-reminder.service';
import {
  customMeetingBody,
  customMeetingReminderBody,
} from '../notification/reminder-copy';
import { appPath } from '../notification/app-paths';
import { MeetingType, NotificationType } from '../../generated/prisma/enums';

/**
 * Die zwei Nachrichten, die es nur für besondere Termine gibt.
 *
 * Der Dienstagabend braucht keine davon: er steht jede Woche, alle wissen es,
 * und wer eine Rolle hat, bekommt seine eigene Erinnerung. Ein Geburtstag oder
 * eine Freizeit sind das Gegenteil — sie fallen aus dem Rhythmus, betreffen
 * alle gleichermaßen und gehen deshalb genau dann unter, wenn niemand
 * ausdrücklich Bescheid sagt. Das war bisher WhatsApp.
 *
 * Zwei Nachrichten und nicht eine, weil es zwei Fragen sind: „gibt es etwas
 * Neues" beantwortet man einmal beim Eintragen, „ich muss daran denken"
 * braucht eine Vorlaufzeit.
 */
@Injectable()
export class CustomMeetingNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly reminders: MeetingReminderService,
  ) {}

  /**
   * „Es gibt einen neuen Termin."
   *
   * Nur bei von Hand angelegten: die sieben Dienstage, die der Generator jede
   * Nacht auffüllt, sind keine Neuigkeit, und eine Benachrichtigung darüber
   * wäre die schnellste Art, Benachrichtigungen abzuschalten.
   *
   * Die anlegende Person bleibt außen vor — sie weiß es.
   */
  async announceCreation(
    meetingId: string,
    actorPersonId?: string,
  ): Promise<number> {
    const meeting = await this.prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
      select: {
        id: true,
        hauskreisId: true,
        date: true,
        endDate: true,
        type: true,
        title: true,
      },
    });

    if (meeting.type !== MeetingType.CUSTOM) return 0;

    const recipients = await this.activeMembers(
      meeting.hauskreisId,
      actorPersonId,
    );

    const results = await Promise.all(
      recipients.map((personId) =>
        this.notifications.notify({
          personId,
          type: NotificationType.CUSTOM_MEETING_CREATED,
          relatedMeetingId: meeting.id,
          payload: {
            title: meeting.title ?? 'Ein besonderer Termin',
            body: customMeetingBody(meeting.date, meeting.endDate),
            url: appPath.meeting(meeting.id),
          },
        }),
      ),
    );

    return results.filter((result) => result.skipped === 0).length;
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'custom-meeting-reminders' })
  async handleCron(): Promise<void> {
    await this.sendDueReminders();
  }

  /**
   * „Der besondere Termin steht an."
   *
   * Anders als bei Host, Thema und Musik gehen die Empfänger nicht aus dem
   * Termin hervor — es sind schlicht alle. Deshalb schlägt diese
   * `recipients`-Funktion als einzige nach.
   */
  sendDueReminders(
    options: ReminderRunOptions = {},
  ): Promise<ReminderRunResult> {
    return this.reminders.run(
      NotificationType.CUSTOM_MEETING_REMINDER,
      async (meeting) => {
        if (meeting.type !== MeetingType.CUSTOM) return [];

        const members = await this.activeMembers(meeting.hauskreisId);

        return members.map((personId) => ({
          personId,
          payload: {
            title: meeting.title ?? 'Ein besonderer Termin',
            body: customMeetingReminderBody(meeting.date, meeting.endDate),
            url: appPath.meeting(meeting.id),
          },
        }));
      },
      options,
    );
  }

  private async activeMembers(
    hauskreisId: string,
    exceptPersonId?: string,
  ): Promise<string[]> {
    const people = await this.prisma.person.findMany({
      where: {
        hauskreisId,
        active: true,
        ...(exceptPersonId ? { id: { not: exceptPersonId } } : {}),
      },
      select: { id: true },
    });

    return people.map((person) => person.id);
  }
}
