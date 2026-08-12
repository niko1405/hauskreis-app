import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import {
  formatMeetingDate,
  formatShortDate,
} from '../notification/reminder-copy';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';
import { formatWallClock } from '../common/time/wall-clock';
import { GroupClockService } from './group-clock.service';
import { appPath } from '../notification/app-paths';
import type { ReleasedRoles } from './role-release.service';

/**
 * The notifications that fire because something changed, not because a date
 * came closer.
 *
 * Called from `MeetingService` after the write has gone through, never before:
 * a notification about a cancellation that then fails to save would be worse
 * than a late one. Each send is best-effort — a push service having a bad day
 * must not turn a successful cancellation into a failed request.
 */
@Injectable()
export class MeetingNotificationService {
  private readonly logger = new Logger(MeetingNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly roleSuggestions: RoleSuggestionService,
  ) {}

  /**
   * Tells the whole group an evening is off.
   *
   * Only for meetings still ahead: cancelling a past one is a bookkeeping
   * correction, and nobody needs to hear that Tuesday three weeks ago did not
   * happen.
   */
  announceCancellation(meetingId: string): Promise<number> {
    return this.announceStatusChange(meetingId, (what, date) => ({
      title: 'Fällt aus',
      body: `${what} am ${formatMeetingDate(date)} fällt aus.`,
    }));
  }

  /**
   * Die Gegenrichtung: der Abend findet doch statt.
   *
   * Passiert, wenn nach lauter Absagen wieder jemand zusagt. Ohne diese
   * Nachricht wüssten das nur die, die zufällig noch einmal in die App sehen —
   * alle anderen haben „fällt aus" gelesen und planen anders.
   *
   * Bewusst **dieselbe** Art wie die Absage und kein eigener Schalter: wer
   * „Hauskreis fällt aus" abonniert hat, meint dieses Thema, und ein neunter
   * Eintrag in den Einstellungen für einen Sonderfall macht die Liste
   * schlechter.
   */
  announceRevival(meetingId: string): Promise<number> {
    return this.announceStatusChange(meetingId, (what, date) => ({
      title: 'Findet doch statt',
      body: `${what} am ${formatMeetingDate(date)} ist wieder dabei — jemand hat doch zugesagt.`,
    }));
  }

  /**
   * „Wir fangen jetzt um 19:30 an."
   *
   * Nur für den **nächsten** Abend. Eine Uhrzeit in fünf Wochen zu verschieben
   * ändert für heute nichts — man liest es, wenn man ohnehin hinschaut. Der
   * nächste dagegen ist der, vor dessen Tür man sonst zur falschen Zeit steht,
   * und genau dafür ist eine Push-Nachricht da.
   *
   * Nicht an die Person, die es geändert hat: sie hat es gerade getippt.
   */
  async announceTimeChange(
    meetingId: string,
    previousMinutes: number,
    actorPersonId: string,
  ): Promise<number> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        hauskreisId: true,
        date: true,
        title: true,
        status: true,
        startMinutes: true,
      },
    });

    if (
      !meeting ||
      meeting.status !== MeetingStatus.PLANNED ||
      (await this.clock.isPast(meeting.hauskreisId, meeting.date))
    ) {
      return 0;
    }

    // Dieselbe Frage wie auf dem Startbildschirm: welcher Abend steht als
    // nächster an. Zwei Formulierungen davon wären zwei Gelegenheiten, sie
    // verschieden zu beantworten.
    const next = await this.prisma.meeting.findFirst({
      where: {
        hauskreisId: meeting.hauskreisId,
        date: { gte: await this.clock.today(meeting.hauskreisId) },
        status: MeetingStatus.PLANNED,
      },
      orderBy: { date: 'asc' },
      select: { id: true },
    });

    if (next?.id !== meeting.id) {
      return 0;
    }

    // Beide Richtungen laufen über dieselbe Art, und `hasBeenSent` verschluckte
    // die zweite Verschiebung sonst als Dublette der ersten — dieselbe
    // Überlegung wie bei Absage und Wiederbelebung.
    await this.prisma.notificationLog.deleteMany({
      where: {
        type: NotificationType.MEETING_TIME_CHANGED,
        relatedMeetingId: meeting.id,
      },
    });

    const people = await this.prisma.person.findMany({
      where: {
        hauskreisId: meeting.hauskreisId,
        active: true,
        id: { not: actorPersonId },
      },
      select: { id: true },
    });

    return this.sendAll(
      people.map((person) => ({
        personId: person.id,
        type: NotificationType.MEETING_TIME_CHANGED,
        relatedMeetingId: meeting.id,
        payload: {
          title: 'Neue Uhrzeit',
          body: `${meeting.title ?? 'Der Hauskreis'} am ${formatShortDate(meeting.date)} fängt jetzt um ${formatWallClock(meeting.startMinutes)} an, nicht um ${formatWallClock(previousMinutes)}.`,
          url: appPath.meeting(meeting.id),
        },
      })),
    );
  }

  private async announceStatusChange(
    meetingId: string,
    copy: (what: string, date: Date) => { title: string; body: string },
  ): Promise<number> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, hauskreisId: true, date: true, title: true },
    });

    if (!meeting || meeting.date < toUtcDate(new Date())) {
      return 0;
    }

    // Beide Richtungen laufen über dieselbe Art, und `hasBeenSent` würde die
    // zweite Nachricht deshalb als Dublette der ersten verschlucken. Der
    // Merkposten wird also weggeräumt: einmal je Richtungswechsel, nicht einmal
    // je Termin.
    await this.prisma.notificationLog.deleteMany({
      where: {
        type: NotificationType.MEETING_CANCELLED,
        relatedMeetingId: meeting.id,
      },
    });

    const people = await this.prisma.person.findMany({
      where: { hauskreisId: meeting.hauskreisId, active: true },
      select: { id: true },
    });

    const text = copy(meeting.title ?? 'Der Hauskreis', meeting.date);

    return this.sendAll(
      people.map((person) => ({
        personId: person.id,
        type: NotificationType.MEETING_CANCELLED,
        relatedMeetingId: meeting.id,
        payload: { ...text, url: appPath.meeting(meeting.id) },
      })),
    );
  }

  /**
   * Reacts to somebody dropping out of an upcoming meeting.
   *
   * Two things can follow, and they are independent: the host wants to know
   * (they are the one shopping), and a home too small for the full group may
   * suddenly fit. The second is why this runs at all for meetings that have no
   * host yet.
   */
  async handleDecline(
    meetingId: string,
    personId: string,
    /**
     * Was die Absage an Rollen freigemacht hat. Der Aufrufer gibt sie vorher
     * frei und reicht das Ergebnis durch — dass ein Gastgeber-Platz offen ist,
     * geht die ganze Gruppe an und nicht nur den Gastgeber, den es nicht mehr
     * gibt.
     */
    released: ReleasedRoles = {
      host: false,
      song: false,
      testimony: false,
      topic: false,
    },
  ): Promise<void> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        hauskreisId: true,
        date: true,
        status: true,
        hostPersonId: true,
        locationId: true,
      },
    });

    if (
      !meeting ||
      meeting.status !== MeetingStatus.PLANNED ||
      meeting.date < toUtcDate(new Date())
    ) {
      return;
    }

    await Promise.all([
      this.notifyHostAboutDecline(meeting, personId),
      this.announceReleasedRoles(meeting, personId, released),
      this.offerUnlockedHomes(meeting),
    ]);
  }

  /**
   * „Der Gastgeber-Platz ist wieder frei."
   *
   * Kein eigener Schalter dafür: wer „jemand sagt ab" abonniert hat, will
   * gerade diese Absage erfahren — sie ist die einzige, die etwas zu tun übrig
   * lässt. Ein zehnter Eintrag in den Einstellungen für den Sonderfall machte
   * die Liste schlechter, nicht besser.
   */
  private async announceReleasedRoles(
    meeting: { id: string; hauskreisId: string; date: Date },
    personId: string,
    released: ReleasedRoles,
  ): Promise<void> {
    const what = describeReleased(released);
    if (!what) return;

    const [person, others] = await Promise.all([
      this.prisma.person.findUnique({
        where: { id: personId },
        select: { name: true },
      }),
      this.prisma.person.findMany({
        where: {
          hauskreisId: meeting.hauskreisId,
          active: true,
          id: { not: personId },
        },
        select: { id: true },
      }),
    ]);

    if (!person) return;

    await this.sendAll(
      others.map((other) => ({
        personId: other.id,
        type: NotificationType.ATTENDANCE_DECLINED,
        relatedMeetingId: meeting.id,
        relatedPersonId: personId,
        payload: {
          title: 'Da ist etwas offen',
          body: `${person.name} kann am ${formatShortDate(meeting.date)} nicht. ${what} wieder frei.`,
          url: appPath.meeting(meeting.id),
        },
      })),
    );
  }

  private async notifyHostAboutDecline(
    meeting: { id: string; date: Date; hostPersonId: string | null },
    personId: string,
  ): Promise<void> {
    // Nobody to tell, and telling yourself you cancelled is noise.
    if (!meeting.hostPersonId || meeting.hostPersonId === personId) {
      return;
    }

    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { name: true },
    });

    if (!person) {
      return;
    }

    await this.sendAll([
      {
        personId: meeting.hostPersonId,
        type: NotificationType.ATTENDANCE_DECLINED,
        relatedMeetingId: meeting.id,
        // What separates the second drop-out from the first.
        relatedPersonId: personId,
        payload: {
          title: 'Absage für deinen Abend',
          body: `${person.name} kann am ${formatShortDate(meeting.date)} nicht.`,
          url: appPath.meeting(meeting.id),
        },
      },
    ]);
  }

  /**
   * Invites the residents of a home that only fits the reduced group.
   *
   * Silent once the evening has a host or a place — the message is an offer to
   * fill a gap, and there is no gap any more. Deduplication is per meeting, so
   * a home is offered once per evening however many further cancellations
   * follow.
   */
  private async offerUnlockedHomes(meeting: {
    id: string;
    hauskreisId: string;
    date: Date;
    hostPersonId: string | null;
    locationId: string | null;
  }): Promise<void> {
    if (meeting.hostPersonId || meeting.locationId) {
      return;
    }

    const unlocked = await this.roleSuggestions.findHomesUnlockedByAbsences(
      meeting.hauskreisId,
      meeting.id,
    );

    await this.sendAll(
      unlocked.flatMap(({ home, residents }) =>
        residents.map((resident) => ({
          personId: resident.id,
          type: NotificationType.HOST_CAPACITY_UNLOCKED,
          relatedMeetingId: meeting.id,
          payload: {
            title: 'Bei euch wäre jetzt Platz',
            body: `Am ${formatShortDate(meeting.date)} haben genug abgesagt, dass der Hauskreis bei euch (${home.name}) stattfinden könnte.`,
            url: appPath.meeting(meeting.id),
          },
        })),
      ),
    );
  }

  /** Sends everything and swallows failures, counting what got through. */
  private async sendAll(
    messages: Parameters<NotificationService['notify']>[0][],
  ): Promise<number> {
    const results = await Promise.all(
      messages.map((message) =>
        this.notifications.notify(message).catch((error: unknown) => {
          this.logger.warn(
            `Could not send ${message.type} to ${message.personId}: ${
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

/**
 * „Gastgeber und Musik sind wieder frei." — oder nichts, wenn nichts frei wurde.
 *
 * Als Liste und nicht als geschachtelte Bedingung: bei zwei Rollen ließ sich
 * das noch mit einem Dreifach-Fragezeichen schreiben, bei vieren wären es
 * sechzehn Zweige für einen Satz. Dieselbe Form wie `describeOpenRoles` beim
 * Austritt — und aus demselben Grund vollständig: **das Thema fehlte hier**,
 * obwohl `RoleReleaseService` es längst freigibt. Wer nur dafür zugeteilt war
 * und absagte, ließ `what` auf `null` fallen, und dieser ganze Zweig schwieg.
 */
function describeReleased(released: ReleasedRoles): string | null {
  const free = [
    released.host && 'Der Gastgeber-Platz',
    released.topic && 'Das Thema',
    released.song && 'Die Musik',
    released.testimony && 'Das Testimony',
  ].filter((entry): entry is string => typeof entry === 'string');

  if (free.length === 0) return null;
  if (free.length === 1) return `${free[0]} ist`;

  // Ab zweien steht der Artikel im Weg: „Der Gastgeber-Platz und Die Musik".
  const bare = free.map((entry) => entry.replace(/^(Der|Die|Das) /, ''));

  return `${bare.slice(0, -1).join(', ')} und ${bare[bare.length - 1]} sind`;
}
