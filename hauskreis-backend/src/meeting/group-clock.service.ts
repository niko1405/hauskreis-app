import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TIME_ZONE } from '../common/time/local-evening';
import { currentDay, isPast } from './meeting-schedule';

/**
 * Die Uhr einer Gruppe — welche Zone sie hat, und welchen Tag sie gerade hat.
 *
 * **Warum es diesen Dienst gibt.** Die Zone steht in `MeetingScheduleConfig`,
 * gebraucht wird sie in `currentDay` und `isPast` — also in reinen Funktionen,
 * die in Schleifen, in `where`-Bausteinen und in Filtern stecken. Sie dort
 * überall zu `await`en würde jede dieser Stellen anstecken. Stattdessen löst
 * dieser Dienst die Zone **einmal pro Vorgang** auf, und die reinen Funktionen
 * bekommen eine Zeichenkette.
 *
 * **Warum er hier steht und nicht in `common`.** Seine Quelle ist der
 * Terminplan, und die beiden Funktionen, die er füttert, stehen nebenan in
 * `meeting-schedule.ts`. Er ist trotzdem `@Global()` (siehe `ClockModule`
 * darunter), weil Dashboard, Archiv, Themen, Lieder und die Benachrichtigungen
 * ihn alle brauchen — über einen Import auf `MeetingModule` zöge sich das zu
 * Kreisen zusammen.
 *
 * **Warum er einen Zwischenspeicher hat.** Ein Aufruf der Terminliste fragte
 * sonst für jeden Vergleich erneut dieselbe Zeile ab. Der Server läuft als
 * genau eine Instanz (die Cron-Jobs verträgen keine zweite), es gibt also
 * keinen zweiten Prozess, mit dem etwas abzugleichen wäre — und der einzige
 * Schreibweg räumt ihn selbst ab (`forget`).
 */
@Injectable()
export class GroupClockService {
  /** hauskreisId → IANA-Zone. */
  private readonly zones = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Die Zone der Gruppe, oder die Vorgabe.
   *
   * Legt **keine** Zeile an. `getConfig` tut das beim ersten Lesen in der
   * Verwaltung, und dort ist es richtig; hier wäre es eine Überraschung — ein
   * Blick auf die Terminliste erzeugte eine Konfiguration.
   */
  async zoneOf(hauskreisId: string): Promise<string> {
    const cached = this.zones.get(hauskreisId);
    if (cached) return cached;

    const config = await this.prisma.meetingScheduleConfig.findUnique({
      where: { hauskreisId },
      select: { timeZone: true },
    });

    const zone = config?.timeZone ?? DEFAULT_TIME_ZONE;
    this.zones.set(hauskreisId, zone);
    return zone;
  }

  /** Welchen Kalendertag die Gruppe gerade hat, als UTC-Mitternacht. */
  async today(hauskreisId: string, now?: Date): Promise<Date> {
    return currentDay(await this.zoneOf(hauskreisId), now);
  }

  /**
   * Liegt dieser Termintag hinter uns?
   *
   * Für Stellen mit genau einem Vergleich. Wer mehrere hat, holt sich einmal
   * `zoneOf` und ruft `isPast` aus `meeting-schedule` direkt — sonst stünde in
   * einer Schleife ein `await`, das immer dieselbe Antwort holt.
   */
  async isPast(hauskreisId: string, date: Date, now?: Date): Promise<boolean> {
    return isPast(date, await this.zoneOf(hauskreisId), now);
  }

  /** Nach jedem Schreiben der Konfiguration zu rufen. */
  forget(hauskreisId: string): void {
    this.zones.delete(hauskreisId);
  }
}

/**
 * Global, damit niemand `MeetingModule` importieren muss, nur um zu wissen,
 * welchen Tag wir haben. Der Dienst selbst hängt an nichts außer Prisma, das
 * ebenfalls global ist — es entsteht also kein Kreis.
 */
@Global()
@Module({
  providers: [GroupClockService],
  exports: [GroupClockService],
})
export class ClockModule {}
