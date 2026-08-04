import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import {
  formatMeetingDate,
  formatShortDate,
} from '../notification/reminder-copy';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';
import { toUtcDate } from './meeting-schedule';
import { appPath } from '../notification/app-paths';

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
    released: { host: boolean; song: boolean } = { host: false, song: false },
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
    released: { host: boolean; song: boolean },
  ): Promise<void> {
    if (!released.host && !released.song) return;

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

    const what = released.host
      ? released.song
        ? 'Gastgeber und Musik sind'
        : 'Der Gastgeber-Platz ist'
      : 'Die Musik ist';

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
