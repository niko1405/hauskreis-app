import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Welche Bausteine eine Gruppe überhaupt benutzt.
 *
 * **Warum es diesen Dienst gibt.** Die beiden Schalter stehen bei ihrer eigenen
 * Einstellung — `prayer_buddy_cycle_config.enabled` und
 * `meeting_schedule_config.weekly_actionstep` —, gefragt wird aber überall:
 * vom Startbildschirm, von den nächtlichen Läufen, von der
 * Benachrichtigungsliste und vom Hauskreis selbst. Jede dieser Stellen an den
 * jeweiligen Fachdienst zu hängen zöge den Modulgraphen zu Kreisen zusammen
 * (`DashboardModule` → `PrayerBuddyModule` → `NotificationModule` → …).
 *
 * Also derselbe Weg wie bei `GroupClockService`: ein winziger Dienst, der außer
 * Prisma an nichts hängt, `@Global` bereitsteht und die Spalte liest, wo sie
 * steht.
 *
 * **Ohne Zwischenspeicher**, anders als die Uhr. Die wird in Schleifen und
 * Filtern gebraucht, also dutzendfach je Anfrage; hier fällt je Vorgang genau
 * eine Frage an — und ein Schalter, den man gerade umgelegt hat und der noch
 * eine Minute lang alt antwortet, wäre schlimmer als eine Abfrage mehr.
 *
 * **Fehlt die Zeile, gilt die Vorgabe.** Beide Tabellen werden erst beim ersten
 * Lesen in der Verwaltung angelegt; eine Gruppe, die nie etwas eingestellt hat,
 * hat also keine — und benutzt selbstverständlich beides.
 */
@Injectable()
export class GroupFeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Beide Schalter in einer Runde — für alle, die ohnehin beide brauchen. */
  async of(hauskreisId: string): Promise<GroupFeatures> {
    const [prayer, schedule] = await Promise.all([
      this.prisma.prayerBuddyCycleConfig.findUnique({
        where: { hauskreisId },
        select: { enabled: true },
      }),
      this.prisma.meetingScheduleConfig.findUnique({
        where: { hauskreisId },
        select: { weeklyActionstep: true },
      }),
    ]);

    return {
      prayerBuddies: prayer?.enabled ?? true,
      weeklyActionstep: schedule?.weeklyActionstep ?? true,
    };
  }

  async prayerBuddies(hauskreisId: string): Promise<boolean> {
    const row = await this.prisma.prayerBuddyCycleConfig.findUnique({
      where: { hauskreisId },
      select: { enabled: true },
    });

    return row?.enabled ?? true;
  }

  async weeklyActionstep(hauskreisId: string): Promise<boolean> {
    const row = await this.prisma.meetingScheduleConfig.findUnique({
      where: { hauskreisId },
      select: { weeklyActionstep: true },
    });

    return row?.weeklyActionstep ?? true;
  }
}

/** Was eine Gruppe benutzt — die Antwort, die auch im Frontend ankommt. */
export interface GroupFeatures {
  prayerBuddies: boolean;
  weeklyActionstep: boolean;
}

/**
 * Global, aus demselben Grund wie `ClockModule`: Niemand soll ein Fachmodul
 * importieren müssen, nur um zu wissen, ob es dessen Feature überhaupt gibt.
 */
@Global()
@Module({
  providers: [GroupFeaturesService],
  exports: [GroupFeaturesService],
})
export class GroupFeaturesModule {}
