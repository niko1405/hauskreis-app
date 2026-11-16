import { Injectable } from '@nestjs/common';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import { touchHauskreis } from '../hauskreis/hauskreis-version';
import type { IfMatchCondition } from '../common/http/etag';
import { EVENING_HOUR, eveningReached } from '../common/time/local-evening';
import { GroupClockService } from './group-clock.service';
import type { UpdateMeetingScheduleDto } from './dto/meeting.dto';

/** Dienstag — was es war, bevor es einstellbar wurde. */
export const DEFAULT_WEEKDAY = 2;
/** 18:00, aus derselben Quelle wie die Sichtbarkeitsgrenze. */
export const DEFAULT_START_MINUTES = EVENING_HOUR * 60;
/** Jede Woche — was es war, bevor der Abstand einstellbar wurde. */
export const DEFAULT_INTERVAL_WEEKS = 1;

/** Was der Terminplaner über den Rhythmus wissen muss. */
export interface MeetingRhythm {
  /** Ob überhaupt Termine angelegt werden. */
  autoGenerate: boolean;
  /** 0 = Sonntag … 6 = Samstag, wie `Date.getUTCDay()`. */
  weekday: number;
  /** Wochen zwischen zwei Terminen. 1 = jede Woche. */
  intervalWeeks: number;
  /** Minuten seit Mitternacht Ortszeit. */
  startMinutes: number;
  /** Ob der letzte Termin eines Monats ein Lobpreisabend wird. */
  praiseEvenings: boolean;
  /** Ob erzeugte Termine den Baustein „Snacks" schon mitbringen. */
  snackSlot: boolean;
  /** Ob es den Baustein „Testimony" in der Gruppe gibt. */
  testimony: boolean;
}

const configInclude = {
  updatedBy: { select: personRefSelect },
} as const;

/**
 * Wann sich die Gruppe trifft.
 *
 * Eine Einstellung der Gruppe und keine Konstante: Nicht jeder Hauskreis
 * trifft sich dienstags um 18 Uhr.
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
      select: {
        autoGenerate: true,
        weekday: true,
        intervalWeeks: true,
        startMinutes: true,
        praiseEvenings: true,
        snackSlot: true,
        testimony: true,
      },
    });

    // Kein Anlegen hier: ein nächtlicher Lauf soll keine Zeilen für Gruppen
    // erzeugen, die nie in die Verwaltung geschaut haben. Die Vorgabe steht in
    // der Spalte und gilt so oder so — sie muss aber **hier auch stehen**, sonst
    // bekäme eine Gruppe ohne Zeile `undefined` statt des Vorgabewerts.
    return (
      config ?? {
        autoGenerate: true,
        weekday: DEFAULT_WEEKDAY,
        intervalWeeks: DEFAULT_INTERVAL_WEEKS,
        startMinutes: DEFAULT_START_MINUTES,
        praiseEvenings: true,
        // Als einziger aus: Snacks sind eine Einladung und kein Abschalten.
        snackSlot: false,
        testimony: true,
      }
    );
  }

  /**
   * Ändert den Rhythmus. Gilt für **neue** Abende, nicht rückwirkend.
   *
   * Wer den Wochentag umstellt, verschiebt nichts, was schon im Kalender steht:
   * für die stehenden Termine haben Leute zugesagt, ein Thema vorbereitet, das
   * Wohnzimmer eingeplant. Der Generator füllt den neuen Tag auf, die alten
   * laufen aus.
   */
  async updateConfig(
    hauskreisId: string,
    dto: UpdateMeetingScheduleDto,
    updatedByPersonId: string | null,
    condition?: IfMatchCondition,
    now: Date = new Date(),
  ) {
    const before = await this.getConfig(hauskreisId);

    // Die Zone hängt im Zwischenspeicher der Uhr. Vor dem Schreiben abgeräumt
    // und nicht danach: schlägt der Versionsvergleich fehl, ist ein leerer
    // Zwischenspeicher ohne Folgen — ein alter Wert dagegen bliebe stehen.
    this.clock.forget(hauskreisId);

    const updated = await updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.meetingScheduleConfig.updateMany({
          where: { hauskreisId, ...versionConstraint },
          data: {
            autoGenerate: dto.autoGenerate,
            weekday: dto.weekday,
            intervalWeeks: dto.intervalWeeks,
            startMinutes: dto.startTime,
            timeZone: dto.timeZone,
            weeklyActionstep: dto.weeklyActionstep,
            praiseEvenings: dto.praiseEvenings,
            snackSlot: dto.snackSlot,
            testimony: dto.testimony,
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

    // Die Schalter stehen als `features` auch in der Antwort des Hauskreises.
    const flipped = (key: 'weeklyActionstep' | 'testimony') =>
      dto[key] !== undefined && dto[key] !== before[key];

    if (flipped('testimony') && dto.testimony === false) {
      await this.removeUpcomingTestimonies(hauskreisId, now);
    }

    if (flipped('weeklyActionstep') || flipped('testimony')) {
      await touchHauskreis(this.prisma, hauskreisId);
    }

    return updated;
  }

  /**
   * Nimmt das Testimony von allen Abenden, die noch kommen — samt Einteilung.
   *
   * „Kommend" heißt hier **noch nicht angefangen**, nicht bloß „heute oder
   * später": Ein Abend, der gerade läuft, wird schon gehalten, und was an ihm
   * steht, gehört wie die vergangenen zur Geschichte der Gruppe. Deshalb erst
   * nach Tag eingegrenzt und dann an der Treffpunktzeit geprüft — die Zahl der
   * Kandidaten ist klein (die erzeugten reichen sieben Termine weit).
   *
   * Auch abgesagte: Wird die Absage zurückgenommen, stünde sonst eine Rolle
   * da, die es nicht mehr gibt. Eine Nachricht geht nicht raus — das ist eine
   * Entscheidung der Verwaltung, kein Umbau eines einzelnen Abends. Zusagen,
   * die mit der Rolle kamen, bleiben: Wer aus einer Rolle fällt, behält seine
   * Zusage.
   */
  private async removeUpcomingTestimonies(
    hauskreisId: string,
    now: Date,
  ): Promise<number> {
    const [today, zone] = await Promise.all([
      this.clock.today(hauskreisId, now),
      this.clock.zoneOf(hauskreisId),
    ]);

    const candidates = await this.prisma.meeting.findMany({
      where: { hauskreisId, hasTestimonySlot: true, date: { gte: today } },
      select: { id: true, date: true, startMinutes: true },
    });

    const ids = candidates
      .filter(
        (meeting) =>
          !eveningReached(meeting.date, zone, now, meeting.startMinutes),
      )
      .map((meeting) => meeting.id);

    if (ids.length === 0) return 0;

    const { count } = await this.prisma.meeting.updateMany({
      where: { id: { in: ids } },
      data: {
        hasTestimonySlot: false,
        testimonyPersonId: null,
        version: { increment: 1 },
      },
    });

    return count;
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
