import { Injectable } from '@nestjs/common';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import type { IfMatchCondition } from '../common/http/etag';
import { EVENING_HOUR } from '../common/time/local-evening';
import { GroupClockService } from './group-clock.service';
import type { UpdateMeetingScheduleDto } from './dto/meeting.dto';

/** Dienstag — was es war, bevor es einstellbar wurde. */
export const DEFAULT_WEEKDAY = 2;
/** 18:00, aus derselben Quelle wie die Sichtbarkeitsgrenze. */
export const DEFAULT_START_MINUTES = EVENING_HOUR * 60;

/** Wochentag und Uhrzeit, wie der Terminplaner sie braucht. */
export interface MeetingRhythm {
  /** 0 = Sonntag … 6 = Samstag, wie `Date.getUTCDay()`. */
  weekday: number;
  /** Minuten seit Mitternacht Ortszeit. */
  startMinutes: number;
}

const configInclude = {
  updatedBy: { select: personRefSelect },
} as const;

/**
 * Wann sich die Gruppe trifft.
 *
 * Bis eben war das keine Frage, sondern eine Konstante: dienstags, 18 Uhr, im
 * Code. Für die eine Gruppe, für die das geschrieben wurde, stimmte es — für
 * jede zweite nicht, und eine App, die vier Wochentage nicht kennt, ist keine
 * App für Hauskreise.
 *
 * Angelegt beim ersten Lesen, nicht beim Anlegen des Hauskreises: so steht die
 * Vorgabe an einer Stelle, und eine Gruppe, die nie etwas einstellt, trägt
 * keine Zeile mit sich herum. Dasselbe Muster wie beim Gebets-Rhythmus.
 */
@Injectable()
export class MeetingScheduleConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: GroupClockService,
  ) {}

  async getConfig(hauskreisId: string) {
    const existing = await this.prisma.meetingScheduleConfig.findUnique({
      where: { hauskreisId },
      include: configInclude,
    });

    if (existing) {
      return shape(existing);
    }

    return shape(
      await this.prisma.meetingScheduleConfig.create({
        data: { hauskreisId },
        include: configInclude,
      }),
    );
  }

  /**
   * Wochentag und Uhrzeit für den Terminplaner.
   *
   * Eigene Methode neben `getConfig`, weil der Generator sie für **jeden**
   * Hauskreis nacheinander aufruft und die Personendaten dabei nur mitgeladener
   * Ballast wären.
   */
  async getRhythm(hauskreisId: string): Promise<MeetingRhythm> {
    const config = await this.prisma.meetingScheduleConfig.findUnique({
      where: { hauskreisId },
      select: { weekday: true, startMinutes: true },
    });

    // Kein Anlegen hier: ein nächtlicher Lauf soll keine Zeilen für Gruppen
    // erzeugen, die nie in die Verwaltung geschaut haben. Die Vorgabe steht in
    // der Spalte und gilt so oder so.
    return (
      config ?? {
        weekday: DEFAULT_WEEKDAY,
        startMinutes: DEFAULT_START_MINUTES,
      }
    );
  }

  /**
   * Ändert den Rhythmus. Gilt für **neue** Abende, nicht rückwirkend.
   *
   * Wer den Wochentag umstellt, verschiebt nichts, was schon im Kalender steht:
   * für die stehenden Termine haben Leute zugesagt, ein Thema vorbereitet, das
   * Wohnzimmer eingeplant. Der Generator füllt ab jetzt den neuen Tag auf, die
   * alten laufen aus.
   */
  async updateConfig(
    hauskreisId: string,
    dto: UpdateMeetingScheduleDto,
    updatedByPersonId: string | null,
    condition?: IfMatchCondition,
  ) {
    await this.getConfig(hauskreisId);

    // Die Zone hängt im Zwischenspeicher der Uhr. Vor dem Schreiben abgeräumt
    // und nicht danach: schlägt der Versionsvergleich fehl, ist ein leerer
    // Zwischenspeicher ohne Folgen — ein alter Wert dagegen bliebe stehen.
    this.clock.forget(hauskreisId);

    return updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.meetingScheduleConfig.updateMany({
          where: { hauskreisId, ...versionConstraint },
          data: {
            weekday: dto.weekday,
            startMinutes: dto.startTime,
            timeZone: dto.timeZone,
            updatedByPersonId,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.meetingScheduleConfig.findUnique({
          where: { hauskreisId },
        }),
      reload: () => this.getConfig(hauskreisId),
      notFoundMessage: `No meeting schedule for Hauskreis ${hauskreisId}`,
    });
  }
}

/**
 * Aus Minuten wird wieder eine Uhrzeit — dieselbe Umformung wie am Termin.
 *
 * Das Antwort-Schema lässt `startMinutes` danach von selbst weg; gerechnet wird
 * mit der Zahl, gelesen wird `"18:00"`.
 */
function shape<T extends { startMinutes: number }>(config: T) {
  return { ...config, startTime: config.startMinutes };
}
