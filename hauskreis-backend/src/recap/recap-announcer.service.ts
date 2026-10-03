import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';
import { formatShortDate } from '../notification/reminder-copy';
import { appPath } from '../notification/app-paths';
import { ANGEKOMMEN } from '../person/angekommen';
import { GroupClockService } from '../meeting/group-clock.service';
import { eveningReached } from '../common/time/local-evening';

/** Was ein Abend nachher zu erzählen hat. */
export interface RecapTexts {
  summary: string | null;
  actionstep: string | null;
}

/**
 * Woher die Texte kamen, die gerade geschrieben wurden.
 *
 * Ein Abend hat zwei mögliche Orte dafür — die Einheit seines Themas oder die
 * eigene Nachbereitung —, und welcher gilt, sagt sein Baustein (dieselbe
 * Regel wie `actionstepOf`). Schreibt jemand am anderen Ort, steht dort ein
 * Text, den an diesem Abend niemand sieht; darüber gibt es nichts zu melden.
 */
export type RecapSource = 'meeting' | 'session';

const FIELDS = ['summary', 'actionstep'] as const;

/**
 * Wie viele Abende zurück nach dem letzten begonnenen gesucht wird. Drei
 * reichen: Heute kann einer anstehen, der noch nicht begonnen hat, und eine
 * mehrtägige Freizeit davor ist der einzige Grund für einen dritten.
 */
const LOOKBACK = 3;

/**
 * „Die Zusammenfassung vom 4. August ist da."
 *
 * An alle außer dem, der sie geschrieben hat — gerade für die, die nicht da
 * waren, ist das die Nachricht des Abends. Nur für den **zeitlich letzten**
 * Abend, der begonnen hat: Wer einen Rückblick von vor drei Wochen nachträgt,
 * macht Buchführung, und die braucht niemand auf dem Sperrbildschirm.
 *
 * **Nur beim ersten Mal, und zwar je Feld.** Die Regel ist der Übergang „war
 * leer, ist jetzt gefüllt" an der Stelle, an der geschrieben wird — nicht der
 * bloße Eintrag in der Box. Der würde für den ursprünglichen Autor fehlen, und
 * der bekäme dann eine Nachricht, sobald jemand anders einen Tippfehler
 * korrigiert. `relatedKey` sichert zusätzlich gegen ein zweites Mal, wenn ein
 * Text gelöscht und neu geschrieben wird.
 */
@Injectable()
export class RecapAnnouncer {
  private readonly logger = new Logger(RecapAnnouncer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Nach jedem Schreiben aufrufen, das Zusammenfassung oder Actionstep eines
   * Abends berühren kann. Fehler werden geschluckt: Eine Nachricht, die nicht
   * rausgeht, darf das Speichern nicht scheitern lassen.
   */
  async afterWrite(params: {
    meetingId: string | null;
    actorPersonId: string;
    source: RecapSource;
    before: RecapTexts;
    now?: Date;
  }): Promise<number> {
    if (!params.meetingId) return 0;

    try {
      return await this.announce({ ...params, meetingId: params.meetingId });
    } catch (error) {
      this.logger.warn(
        `Could not announce recap for ${params.meetingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  private async announce(params: {
    meetingId: string;
    actorPersonId: string;
    source: RecapSource;
    before: RecapTexts;
    now?: Date;
  }): Promise<number> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: params.meetingId },
      select: {
        id: true,
        hauskreisId: true,
        date: true,
        status: true,
        hasTopicSlot: true,
        summaryText: true,
        actionstepText: true,
        topicSession: { select: { summaryText: true, actionstepText: true } },
      },
    });

    if (!meeting || meeting.status === MeetingStatus.CANCELLED) return 0;

    const effective: RecapSource = meeting.hasTopicSlot ? 'session' : 'meeting';
    if (params.source !== effective) return 0;

    const after: RecapTexts =
      effective === 'session'
        ? {
            summary: text(meeting.topicSession?.summaryText),
            actionstep: text(meeting.topicSession?.actionstepText),
          }
        : {
            summary: text(meeting.summaryText),
            actionstep: text(meeting.actionstepText),
          };

    const fresh = FIELDS.filter(
      (field) => text(params.before[field]) === null && after[field] !== null,
    );
    if (fresh.length === 0) return 0;

    const latest = await this.latestStartedMeetingId(
      meeting.hauskreisId,
      params.now,
    );
    if (latest !== meeting.id) return 0;

    const people = await this.prisma.person.findMany({
      where: {
        hauskreisId: meeting.hauskreisId,
        ...ANGEKOMMEN,
        id: { not: params.actorPersonId },
      },
      select: { id: true },
    });

    const day = formatShortDate(meeting.date);

    const results = await Promise.all(
      fresh.flatMap((field) =>
        people.map((person) =>
          this.notifications
            .notify({
              personId: person.id,
              type: NotificationType.RECAP_ADDED,
              relatedMeetingId: meeting.id,
              relatedKey: field,
              payload: {
                title:
                  field === 'summary'
                    ? `Die Zusammenfassung vom ${day} ist da`
                    : `Der Actionstep vom ${day} steht`,
                body: preview(after[field] as string),
                url: appPath.meeting(meeting.id),
              },
            })
            .catch(() => ({ skipped: 1 })),
        ),
      ),
    );

    return results.filter((result) => result.skipped === 0).length;
  }

  /**
   * Der späteste Abend, der schon angefangen hat und nicht abgesagt ist.
   *
   * „Angefangen" an der Treffpunktzeit in der Zone der Gruppe, wie überall:
   * Der Dienstag ist ab 18 Uhr der letzte Abend, nicht schon ab Mitternacht.
   */
  private async latestStartedMeetingId(
    hauskreisId: string,
    now: Date = new Date(),
  ): Promise<string | null> {
    const [zone, today] = await Promise.all([
      this.clock.zoneOf(hauskreisId),
      this.clock.today(hauskreisId, now),
    ]);

    const candidates = await this.prisma.meeting.findMany({
      where: {
        hauskreisId,
        status: { not: MeetingStatus.CANCELLED },
        date: { lte: today },
      },
      orderBy: { date: 'desc' },
      take: LOOKBACK,
      select: { id: true, date: true, startMinutes: true },
    });

    const started = candidates.find((candidate) =>
      eveningReached(candidate.date, zone, now, candidate.startMinutes),
    );

    return started?.id ?? null;
  }
}

/** Ein leerer Text zählt als keiner — dieselbe Regel wie `actionstepOf`. */
function text(value: string | null | undefined): string | null {
  return value && value.trim() !== '' ? value : null;
}

/** Der Anfang, so viel wie auf einen Sperrbildschirm passt. */
function preview(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 119).trimEnd()}…` : flat;
}
