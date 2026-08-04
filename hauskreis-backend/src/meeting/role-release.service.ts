import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingStatus } from '../../generated/prisma/enums';
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
}

export interface ReleasedRoles {
  host: boolean;
  song: boolean;
}
