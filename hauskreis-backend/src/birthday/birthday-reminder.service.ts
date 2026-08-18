import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationPreferenceService } from '../notification/notification-preference.service';
import { notificationDefinition } from '../notification/notification-catalog';
import { appPath } from '../notification/app-paths';
import { NotificationType } from '../../generated/prisma/enums';
import { GroupClockService } from '../meeting/group-clock.service';
import { currentDay } from '../meeting/meeting-schedule';
import { CRON_TIME_ZONE } from '../common/time/local-evening';
import { daysUntil } from './birthday-dates';

/**
 * Erinnert daran, ein Geschenk zu besorgen.
 *
 * **Warum nicht über `MeetingReminderService`.** Der ist auf Termine gebaut —
 * er lädt Abende, kennt Bausteine und Absagen und gibt dem Aufrufer ein
 * `Meeting` in die Hand. Ein Geburtstag ist kein Abend: Er fällt nicht aus, hat
 * keine Rollen und keinen Ort. Was übrig bliebe, wäre der Rahmen, und den gibt
 * es hier in zwanzig Zeilen — billiger als ein zweiter Sonderfall in einem
 * Dienst, der schon einen trägt.
 *
 * **Die Vorlaufzeit ist persönlich**, wie überall: Der Lauf schaut so weit
 * voraus wie die geduldigste Einstellung in der Gruppe und entscheidet je
 * Person, ob heute ihr Tag ist. Dieselbe Zahl bestimmt, ab wann der Geburtstag
 * auf dem Startbildschirm unter „Deine Rollen" steht — es wäre seltsam, dort
 * etwas zu sehen, wovon die Nachricht erst nächste Woche kommt.
 */
@Injectable()
export class BirthdayReminderService {
  private readonly logger = new Logger(BirthdayReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly preferences: NotificationPreferenceService,
    private readonly clock: GroupClockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'birthday-gift-reminders',
    timeZone: CRON_TIME_ZONE,
  })
  async handleCron(): Promise<void> {
    const sent = await this.sendDueReminders();
    if (sent > 0) this.logger.log(`${sent} Geschenk-Erinnerung(en) verschickt`);
  }

  async sendDueReminders(now?: Date): Promise<number> {
    const schedule = notificationDefinition(
      NotificationType.BIRTHDAY_GIFT_REMINDER,
    ).schedule;

    // Der Katalog kennt die Obergrenze; sie hier noch einmal hinzuschreiben
    // hieße, sie an zwei Orten zu pflegen.
    const horizon = schedule.kind === 'LEAD_TIME' ? schedule.maxLeadDays : 0;
    if (horizon === 0) return 0;

    // Bewusst zu weit gegriffen: Jede Gruppe hat ihre eigene Zone, und welcher
    // Tag dort gerade ist, entscheidet sich unten je Hauskreis. Ein Tag
    // Sicherheitsabstand an beiden Enden kostet nichts.
    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + (horizon + 1) * 86_400_000);

    const due = await this.prisma.birthdayOccasion.findMany({
      where: {
        occursOn: { gte: from, lte: to },
        responsiblePersonId: { not: null },
      },
      select: {
        id: true,
        hauskreisId: true,
        occursOn: true,
        responsiblePersonId: true,
        person: { select: { name: true } },
      },
    });

    if (due.length === 0) return 0;

    const settings = await this.preferences.resolveMany(
      due.map((occasion) => occasion.responsiblePersonId!),
      NotificationType.BIRTHDAY_GIFT_REMINDER,
    );

    const zones = new Map<string, Date>();
    for (const occasion of due) {
      if (zones.has(occasion.hauskreisId)) continue;
      zones.set(
        occasion.hauskreisId,
        currentDay(await this.clock.zoneOf(occasion.hauskreisId), now),
      );
    }

    let sent = 0;

    for (const occasion of due) {
      const setting = settings.get(occasion.responsiblePersonId!);
      const leadDays = setting?.leadDays ?? 0;
      const today = zones.get(occasion.hauskreisId)!;
      const days = daysUntil(occasion.occursOn, today);

      // Vorbei ist vorbei, und weiter weg als gewünscht ist noch nicht dran.
      if (days < 0 || days > leadDays) continue;

      const result = await this.notifications.notify({
        personId: occasion.responsiblePersonId!,
        type: NotificationType.BIRTHDAY_GIFT_REMINDER,
        relatedOccasionId: occasion.id,
        payload: {
          title: `${occasion.person.name} hat bald Geburtstag`,
          body: whenPhrase(days, occasion.person.name),
          url: appPath.birthday(occasion.id),
        },
      });

      if (result.skipped === 0) sent += 1;
    }

    return sent;
  }
}

/** Der warme Ton aus CLAUDE.md §9 — „du bist dran", nicht „Zuteilung: X". */
function whenPhrase(days: number, name: string): string {
  if (days === 0) return `Heute ist es soweit — du besorgst das Geschenk.`;
  if (days === 1) return `Morgen schon. Hast du für ${name} etwas?`;
  return `In ${days} Tagen. Du besorgst das Geschenk für ${name}.`;
}
