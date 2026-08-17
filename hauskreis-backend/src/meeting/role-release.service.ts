import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingStatus } from '../../generated/prisma/enums';
import { TopicLinkService } from '../topic/topic-link.service';
import { GroupClockService } from './group-clock.service';
import { clearSongSelectionIfUnled, touchMeeting } from './meeting-version';

/**
 * Wer absagt, gibt seine Rollen für diesen Abend frei.
 *
 * Ohne das hätte die Prüfung beim Zuteilen ein Loch, durch das man mühelos
 * hindurchfällt: erst als Gastgeber eintragen, dann absagen — und am Dienstag
 * steht im Plan jemand, der nicht kommt. Das ist der wahrscheinlichere Weg von
 * beiden; Pläne stehen früh, Absagen kommen spät.
 *
 * Alle vier Rollen werden frei:
 *
 * - **Gastgeber** — und mit ihm der Ort, wenn es seine Wohnung war. Host und Ort
 *   sind in `resolveVenue` eine Entscheidung, also fallen sie auch zusammen.
 * - **Musik** — gilt für genau diesen Abend.
 * - **Testimony** — ebenso. Wer nicht kommt, erzählt an dem Abend nichts, und
 *   der Platz gehört jemandem, der da ist.
 * - **Thema** — seit Neuestem auch. Es blieb einmal stehen, weil die
 *   Zuständigkeit am *Thema* hing und nicht am Abend: sie fallen zu lassen hätte
 *   geheißen, jemanden von seiner Vorbereitung für alle kommenden Abende zu
 *   entbinden. Jetzt ist es eine Zuteilung wie die anderen drei, und ein Abend,
 *   an dem der Zuständige nachweislich fehlt, soll nicht zugeteilt aussehen. Die
 *   Vorbereitung geht dabei nicht verloren — die Einheit wird nur vom Termin
 *   gelöst und wartet als Entwurf.
 *
 * Vergangene und abgesagte Abende bleiben unberührt: dort wird nachgetragen,
 * was war, und was war, ändert eine Absage von heute nicht mehr.
 */
@Injectable()
export class RoleReleaseService {
  private readonly logger = new Logger(RoleReleaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly topicLinks: TopicLinkService,
    private readonly clock: GroupClockService,
  ) {}

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
        // Nur für die Zone der Gruppe: ob dieser Abend vorbei ist, hängt an
        // ihrem Kalendertag, nicht an dem des Servers.
        hauskreisId: true,
        date: true,
        status: true,
        hostPersonId: true,
        locationId: true,
        testimonyPersonId: true,
        location: { select: { requiresHost: true } },
      },
    });

    if (
      !meeting ||
      meeting.status === MeetingStatus.CANCELLED ||
      (await this.clock.isPast(meeting.hauskreisId, meeting.date))
    ) {
      return { host: false, song: false, testimony: false, topic: false };
    }

    const host = meeting.hostPersonId === personId;
    const testimony = meeting.testimonyPersonId === personId;

    // Ein Schreibvorgang für beides: zwei Aktualisierungen wären zwei
    // Versionssprünge an derselben Zeile, und die zweite ließe die erste als
    // Konflikt aussehen.
    if (host || testimony) {
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: {
          ...(host
            ? {
                hostPersonId: null,
                // Ein Treffpunkt hing nie am Gastgeber und bleibt stehen; eine
                // Wohnung ohne ihre Bewohner:innen ergibt keinen Sinn.
                locationId: meeting.location?.requiresHost ? null : undefined,
              }
            : {}),
          ...(testimony ? { testimonyPersonId: null } : {}),
          version: { increment: 1 },
        },
      });
    }

    const { count } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.meetingSongLeader.deleteMany({
        where: { meetingId, personId },
      });

      // War das der oder die Letzte, fällt auch die Lied-Auswahl: Sie darf ab
      // jetzt niemand mehr ändern, und eine Absprache, an der niemand mehr
      // beteiligt ist, ist keine mehr. Dass der Abend noch bevorsteht, steht
      // oben schon fest — vergangene und abgesagte kommen hier nicht an.
      if (result.count > 0) {
        await clearSongSelectionIfUnled(tx, [meetingId]);
      }

      // Nur wenn oben nichts geschrieben wurde: dort ist die Version schon
      // gesprungen, und ein zweiter Sprung an derselben Zeile machte aus einem
      // Vorgang zwei.
      if (result.count > 0 && !host && !testimony) {
        await touchMeeting(tx, meetingId);
      }

      return result;
    });

    // Das Thema zuletzt, weil daran mehr hängt als eine Zeile: bleibt niemand
    // übrig, der zum gewählten Thema gehört, löst sich auch die Einheit vom
    // Abend — sie bleibt als Entwurf erhalten.
    const topic = await this.topicLinks.releaseFor(meetingId, personId);

    if (host || testimony || topic || count > 0) {
      this.logger.log(
        `Released roles of person ${personId} on meeting ${meetingId}: ${[
          host && 'host',
          count > 0 && 'song',
          testimony && 'testimony',
          topic && 'topic',
        ]
          .filter(Boolean)
          .join(', ')}`,
      );
    }

    return { host, song: count > 0, testimony, topic };
  }

  /**
   * Räumt weg, was jemand an **allen** kommenden Abenden noch wäre — für den
   * Fall, dass er den Hauskreis verlässt.
   *
   * Verlassen ist nicht dasselbe wie absagen, und deshalb gelten hier drei
   * Regeln anders:
   *
   * - **Auch die Themen-Zuteilung fällt** — und zwar an *allen* kommenden
   *   Abenden auf einmal, nicht nur an einem. Was die Person an ihren Themen
   *   gearbeitet hat, bleibt: Einheiten und ihre Verantwortlichen sind Archiv,
   *   und ein Thema verliert höchstens seinen Owner (`onDelete: SetNull`).
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
    const today = await this.clock.today(hauskreisId);

    const meetings = await this.prisma.meeting.findMany({
      where: { hauskreisId, date: { gte: today } },
      select: {
        id: true,
        hostPersonId: true,
        testimonyPersonId: true,
        location: { select: { requiresHost: true } },
      },
    });

    const meetingIds = meetings.map((meeting) => meeting.id);

    if (meetingIds.length === 0) {
      return { meetingIds: [], host: 0, song: 0, topic: 0, testimony: 0 };
    }

    const hosted = meetings.filter(
      (meeting) => meeting.hostPersonId === personId,
    );

    const telling = meetings.filter(
      (meeting) => meeting.testimonyPersonId === personId,
    );

    // Die drei Löschungen zuerst, damit sie sich beim Auspacken benennen
    // lassen — die Zahl der Gastgeber-Zeilen steht ohnehin schon fest.
    const [song, topic] = await this.prisma.$transaction([
      this.prisma.meetingSongLeader.deleteMany({
        where: { personId, meetingId: { in: meetingIds } },
      }),
      this.prisma.meetingTopicResponsible.deleteMany({
        where: { personId, meetingId: { in: meetingIds } },
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
            // Gleich mit, wo beides auf dieselbe Person zeigt — sonst
            // schriebe die Schleife darunter dieselbe Zeile ein zweites Mal.
            ...(meeting.testimonyPersonId === personId
              ? { testimonyPersonId: null }
              : {}),
            version: { increment: 1 },
          },
        }),
      ),
      ...telling
        .filter((meeting) => meeting.hostPersonId !== personId)
        .map((meeting) =>
          this.prisma.meeting.update({
            where: { id: meeting.id },
            data: { testimonyPersonId: null, version: { increment: 1 } },
          }),
        ),
      // Über alle, nicht nur die berührten: hier verlässt jemand den Hauskreis,
      // und damit verschwindet er aus jeder Anwesenheits- und Rollenliste, die
      // an einem kommenden Abend hängt. Ein ETag, der das nicht mitbekommt,
      // zeigte ihn weiter an. Dass ein paar Zeilen dabei zweimal springen,
      // schadet nicht — die Version zählt Revisionen, keine Änderungen.
      this.prisma.meeting.updateMany({
        where: { id: { in: meetingIds } },
        data: { version: { increment: 1 } },
      }),
    ]);

    // Wie beim Absagen: Wo mit dieser Person die letzte Musik-Zuteilung ging,
    // fällt auch die Auswahl. Alle Termine hier sind kommende (`date >= today`),
    // ein Protokoll kann also keines dabei sein.
    //
    // Hinter der Transaktion und nicht darin: Die oben ist die Listenform, die
    // ihre Anweisungen im Voraus entgegennimmt — diese Aufräumarbeit muss aber
    // erst *nachsehen*, wo jetzt niemand mehr steht. Ein eigener Durchgang
    // schadet nicht, die Person ist ohnehin schon weg.
    if (song.count > 0) {
      await clearSongSelectionIfUnled(this.prisma, meetingIds);
    }

    if (
      hosted.length > 0 ||
      telling.length > 0 ||
      song.count > 0 ||
      topic.count > 0
    ) {
      this.logger.log(
        `Person ${personId} left: released ${hosted.length} host slot(s), ` +
          `${song.count} song slot(s), ${topic.count} running topic(s), ` +
          `${telling.length} testimony slot(s)`,
      );
    }

    return {
      meetingIds,
      host: hosted.length,
      song: song.count,
      topic: topic.count,
      testimony: telling.length,
    };
  }
}

export interface ReleasedRoles {
  host: boolean;
  song: boolean;
  testimony: boolean;
  topic: boolean;
}

export interface LeftoverRoles {
  /** Alle kommenden Termine — sie alle müssen neu bewertet werden. */
  meetingIds: string[];
  host: number;
  song: number;
  topic: number;
  testimony: number;
}
