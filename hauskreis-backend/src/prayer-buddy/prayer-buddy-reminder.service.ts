import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { appPath } from '../notification/app-paths';
import { NotificationType } from '../../generated/prisma/enums';
import { GroupClockService } from '../meeting/group-clock.service';
import { CRON_TIME_ZONE } from '../common/time/local-evening';
import { GroupFeaturesService } from '../hauskreis/group-features.service';
import type { ReminderRunResult } from '../notification/meeting-reminder.service';
import { PrayerBuddyService } from './prayer-buddy.service';
import { circleFor, formatDate, isHalftime } from './prayer-buddy-copy';

/**
 * „Halbzeit" — die Erinnerung mitten in einer Gebetsrunde.
 *
 * Zum Anfang einer Runde kommt „Neue Gebetsbuddys", danach zwei Wochen lang
 * nichts. Genau in dieser Stille schläft es ein: Man hat sich vorgenommen,
 * füreinander zu beten, und in der zweiten Woche weiß man nicht mehr, für wen.
 * Die Nachricht sagt es noch einmal, mit demselben Satz wie am Anfang.
 *
 * **Einmal je Gruppe und Runde** — entdoppelt wird über die Gruppe, wie bei der
 * Ankündigung. Ein verpasster Morgen kommt zwei Tage lang noch an
 * (`isHalftime`); danach wäre es keine Halbzeit mehr.
 *
 * Um neun wie die übrigen Erinnerungen und nicht im nächtlichen Lauf der
 * Rotation: Der läuft um vier, und eine Nachricht um vier Uhr morgens weckt
 * jemanden, statt ihn zu erinnern.
 */
@Injectable()
export class PrayerBuddyReminderService {
  private readonly logger = new Logger(PrayerBuddyReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly buddies: PrayerBuddyService,
    private readonly notifications: NotificationService,
    private readonly clock: GroupClockService,
    private readonly features: GroupFeaturesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'prayer-buddy-halftime',
    timeZone: CRON_TIME_ZONE,
  })
  async handleCron(): Promise<void> {
    const hauskreise = await this.prisma.hauskreis.findMany({
      select: { id: true },
    });

    const results = await Promise.all(
      hauskreise.map((hauskreis) => this.sendHalftime(hauskreis.id)),
    );
    const notified = results.reduce((sum, result) => sum + result.notified, 0);

    if (notified > 0) {
      this.logger.log(`Sent ${notified} prayer buddy halftime reminder(s)`);
    }
  }

  async sendHalftime(
    hauskreisId: string,
    now = new Date(),
  ): Promise<ReminderRunResult> {
    // Ausgeschaltet heißt ganz aus — dieselbe Frage wie im nächtlichen Lauf.
    if (!(await this.features.prayerBuddies(hauskreisId))) {
      return { notified: 0, skipped: 0 };
    }

    const [today, current] = await Promise.all([
      this.clock.today(hauskreisId, now),
      this.buddies.findCurrent(hauskreisId, now),
    ]);

    if (
      !current ||
      !isHalftime(current.periodStart, current.periodEnd, today)
    ) {
      return { notified: 0, skipped: 0 };
    }

    const results = await Promise.all(
      current.groups
        // Allein betet man trotzdem — aber „für wen betest du" hat dann keine
        // Antwort, an die man erinnern könnte.
        .filter((group) => group.members.length >= 2)
        .flatMap((group) =>
          group.members.map((member, position) =>
            this.notifications.notify({
              personId: member.id,
              type: NotificationType.PRAYER_BUDDY_HALFTIME,
              relatedGroupId: group.id,
              payload: {
                title: 'Halbzeit bei den Gebetsbuddys',
                body: `Noch bis ${formatDate(current.periodEnd)} ${circleFor(group.members, position)} – ein guter Moment, kurz nachzufragen, wie es gerade läuft.`,
                url: appPath.prayerBuddies(),
              },
            }),
          ),
        ),
    );

    return results.reduce(
      (total, result) => ({
        notified: total.notified + (result.skipped === 0 ? 1 : 0),
        skipped: total.skipped + result.skipped,
      }),
      { notified: 0, skipped: 0 },
    );
  }
}
