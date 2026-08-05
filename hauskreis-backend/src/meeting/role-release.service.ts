import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingStatus, TopicStatus } from '../../generated/prisma/enums';
import { toUtcDate } from './meeting-schedule';

/**
 * Wer absagt, gibt seine Rollen für diesen Abend frei.
 *
 * Ohne das hätte die Prüfung beim Zuteilen ein Loch, durch das man mühelos
 * hindurchfällt: erst als Gastgeber eintragen, dann absagen — und am Dienstag
 * steht im Plan jemand, der nicht kommt. Das ist der wahrscheinlichere Weg von
 * beiden; Pläne stehen früh, Absagen kommen spät.
 *
 * Zwei Rollen werden frei, eine nicht:
 *
 * - **Gastgeber** — und mit ihm der Ort, wenn es seine Wohnung war. Host und Ort
 *   sind in `resolveVenue` eine Entscheidung, also fallen sie auch zusammen.
 * - **Musik** — gilt für genau diesen Abend.
 * - **Thema bleibt.** Es zieht sich über mehrere Abende; jemanden wegen einer
 *   einzelnen Absage von seiner Vorbereitung zu entbinden wäre falsch, und beim
 *   nächsten Termin stünde er ohnehin wieder da.
 *
 * Vergangene und abgesagte Abende bleiben unberührt: dort wird nachgetragen,
 * was war, und was war, ändert eine Absage von heute nicht mehr.
 */
@Injectable()
export class RoleReleaseService {
  private readonly logger = new Logger(RoleReleaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gibt die Rollen frei, die diese Person an diesem Abend hatte.
   *
   * Antwortet mit dem, was tatsächlich frei wurde — die Aufrufer hängen ihre
   * Nachricht daran, und „der Gastgeber-Platz ist wieder frei" gehört nur dann
   * in den Text, wenn er es auch ist.
   */
  async releaseFor(
    meetingId: string,
    personId: string,
  ): Promise<ReleasedRoles> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        date: true,
        status: true,
        hostPersonId: true,
        locationId: true,
        location: { select: { requiresHost: true } },
      },
    });

    if (
      !meeting ||
      meeting.status === MeetingStatus.CANCELLED ||
      toUtcDate(meeting.date) < toUtcDate(new Date())
    ) {
      return { host: false, song: false };
    }

    const host = meeting.hostPersonId === personId;

    if (host) {
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: {
          hostPersonId: null,
          // Ein Treffpunkt hing nie am Gastgeber und bleibt stehen; eine
          // Wohnung ohne ihre Bewohner:innen ergibt keinen Sinn.
          locationId: meeting.location?.requiresHost ? null : undefined,
          version: { increment: 1 },
        },
      });
    }

    const { count } = await this.prisma.meetingSongLeader.deleteMany({
      where: { meetingId, personId },
    });

    if (host || count > 0) {
      this.logger.log(
        `Released roles of person ${personId} on meeting ${meetingId}: ${[
          host && 'host',
          count > 0 && 'song',
        ]
          .filter(Boolean)
          .join(', ')}`,
      );
    }

    return { host, song: count > 0 };
  }

  /**
   * Räumt weg, was jemand an **allen** kommenden Abenden noch wäre — für den
   * Fall, dass er den Hauskreis verlässt.
   *
   * Verlassen ist nicht dasselbe wie absagen, und deshalb gelten hier drei
   * Regeln anders:
   *
   * - **Das Thema fällt mit.** Bei einer einzelnen Absage bleibt es stehen,
   *   weil die Person am nächsten Abend wieder da ist. Wer geht, ist an keinem
   *   Abend mehr da; ein Thema, das auf sie wartet, wäre eine Zusage, die
   *   niemand einlösen kann. Abgeschlossene Themen behalten ihre Leute — das
   *   ist Archiv, keine Planung.
   * - **Die eigenen Antworten verschwinden.** „Kommt" oder „kommt nicht" von
   *   jemandem, der gar nicht mehr dabei ist, verzerrt jede Zählung.
   * - **Auch abgesagte Abende werden geräumt.** Bei einer Absage bleiben sie in
   *   Ruhe, weil ein Wiederaufleben die Rollen zurückbringen soll. Hier wäre
   *   das Zurückgebrachte ein Mensch, der nicht mehr da ist.
   *
   * Antwortet mit **allen** kommenden Terminen, nicht nur den berührten: mit
   * der Person ändert sich auch die Zahl der aktiven Menschen, und damit die
   * Schwelle, ab der ein Abend „alle haben abgesagt" ist.
   */
  async releaseEverythingUpcoming(
    hauskreisId: string,
    personId: string,
  ): Promise<LeftoverRoles> {
    const today = toUtcDate(new Date());

    const meetings = await this.prisma.meeting.findMany({
      where: { hauskreisId, date: { gte: today } },
      select: {
        id: true,
        hostPersonId: true,
        location: { select: { requiresHost: true } },
      },
    });

    const meetingIds = meetings.map((meeting) => meeting.id);

    if (meetingIds.length === 0) {
      return { meetingIds: [], host: 0, song: 0, topic: 0 };
    }

    const hosted = meetings.filter(
      (meeting) => meeting.hostPersonId === personId,
    );

    // Die drei Löschungen zuerst, damit sie sich beim Auspacken benennen
    // lassen — die Zahl der Gastgeber-Zeilen steht ohnehin schon fest.
    const [song, topic] = await this.prisma.$transaction([
      this.prisma.meetingSongLeader.deleteMany({
        where: { personId, meetingId: { in: meetingIds } },
      }),
      this.prisma.topicResponsible.deleteMany({
        where: {
          personId,
          topic: { hauskreisId, status: TopicStatus.RUNNING },
        },
      }),
      this.prisma.meetingAttendance.deleteMany({
        where: { personId, meetingId: { in: meetingIds } },
      }),
      ...hosted.map((meeting) =>
        this.prisma.meeting.update({
          where: { id: meeting.id },
          data: {
            hostPersonId: null,
            // Wie oben: ein Treffpunkt hing nie am Gastgeber.
            locationId: meeting.location?.requiresHost ? null : undefined,
            version: { increment: 1 },
          },
        }),
      ),
    ]);

    if (hosted.length > 0 || song.count > 0 || topic.count > 0) {
      this.logger.log(
        `Person ${personId} left: released ${hosted.length} host slot(s), ` +
          `${song.count} song slot(s), ${topic.count} running topic(s)`,
      );
    }

    return {
      meetingIds,
      host: hosted.length,
      song: song.count,
      topic: topic.count,
    };
  }
}

export interface ReleasedRoles {
  host: boolean;
  song: boolean;
}

export interface LeftoverRoles {
  /** Alle kommenden Termine — sie alle müssen neu bewertet werden. */
  meetingIds: string[];
  host: number;
  song: number;
  topic: number;
}
