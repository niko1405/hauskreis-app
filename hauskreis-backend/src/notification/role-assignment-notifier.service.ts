import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';
import {
  AssignmentRole,
  MeetingStatus,
  NotificationType,
} from '../../generated/prisma/enums';
import { formatMeetingDate } from './reminder-copy';
import { appPath } from './app-paths';
import { toUtcDate } from '../meeting/meeting-schedule';

const TITLE: Record<AssignmentRole, string> = {
  HOST: 'Du hostest',
  TOPIC: 'Du machst das Thema',
  SONG: 'Du machst die Musik',
  TESTIMONY: 'Du erzählst dein Testimony',
};

/**
 * „Du wurdest eingeteilt."
 *
 * Bisher erfuhr man von einer Zuteilung erst durch die Erinnerung fünf Tage
 * vorher. Bis dahin stand sie nur in der App — und wer nicht hineinsieht,
 * erfährt sie nicht. Genau das ist das Problem, das die App lösen soll
 * (CLAUDE.md §2: „geht unter, niemand hat den Überblick").
 *
 * Drei Regeln, die alle drei Aufrufer teilen und deshalb hier stehen:
 *
 * - **Nur kommende Abende.** Wer nachträgt, wer im Mai das Thema hatte, soll
 *   niemanden aufschrecken.
 * - **Nur wirklich neue Namen.** Die Aufrufer schicken die Liste, die
 *   dazugekommen ist, nicht die ganze — sonst hörte beim Nachrücken einer
 *   zweiten Person auch die erste noch einmal davon.
 * - **Nicht an sich selbst.** Wer sich einträgt, weiß es bereits.
 *
 * Die Entdopplung hängt an `(Person, Termin, Rolle)`. Ohne die Rolle im
 * Schlüssel hielte `hasBeenSent` die Musik-Einteilung für eine Dublette der
 * Gastgeber-Einteilung am selben Abend.
 */
@Injectable()
export class RoleAssignmentNotifier {
  private readonly logger = new Logger(RoleAssignmentNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * @param actorPersonId Wer die Zuteilung vorgenommen hat, falls bekannt —
   * die Person überspringt der Versand.
   */
  async announce(
    meetingId: string,
    role: AssignmentRole,
    personIds: readonly string[],
    actorPersonId?: string | null,
  ): Promise<number> {
    const recipients = personIds.filter((id) => id !== actorPersonId);
    if (recipients.length === 0) return 0;

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, date: true, status: true, location: true },
    });

    if (!meeting || meeting.status === MeetingStatus.CANCELLED) return 0;
    if (meeting.date < toUtcDate(new Date())) return 0;

    const results = await Promise.all(
      recipients.map((personId) =>
        this.notifications
          .notify({
            personId,
            type: NotificationType.ROLE_ASSIGNED,
            relatedMeetingId: meeting.id,
            relatedRole: role,
            payload: {
              title: TITLE[role],
              body: assignmentBody(role, meeting.date, meeting.location?.name),
              url: appPath.meeting(meeting.id),
            },
          })
          // Best-effort wie überall sonst: ein Push-Dienst mit einem schlechten
          // Tag darf keine gelungene Zuteilung zu einer fehlgeschlagenen
          // Anfrage machen.
          .catch((error: unknown) => {
            this.logger.warn(
              `Could not tell ${personId} about ${role} on ${meetingId}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return { delivered: 0, skipped: 1, pruned: 0, failed: 0 };
          }),
      ),
    );

    return results.filter((result) => result.skipped === 0).length;
  }
}

function assignmentBody(
  role: AssignmentRole,
  date: Date,
  locationName?: string,
): string {
  const when = formatMeetingDate(date);

  if (role === AssignmentRole.HOST) {
    return locationName
      ? `Am ${when} ist der Hauskreis bei dir (${locationName}).`
      : `Am ${when} ist der Hauskreis bei dir.`;
  }

  return role === AssignmentRole.TOPIC
    ? `Am ${when} bist du mit dem Thema dran.`
    : `Am ${when} machst du die Musik.`;
}
