import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingCancellationService } from '../meeting/meeting-cancellation.service';
import { RoleReleaseService } from '../meeting/role-release.service';
import type { ReleasedRoles } from '../meeting/role-release.service';
import { MeetingNotificationService } from '../meeting/meeting-notification.service';
import { AutoAttendanceService } from '../attendance/auto-attendance.service';
import {
  AttendanceSource,
  AttendanceStatus,
} from '../../generated/prisma/enums';
import { touchMeetings } from '../meeting/meeting-version';
import { AbsenceCalendar } from './absence-window';
import { GroupClockService } from '../meeting/group-clock.service';
import { CRON_TIME_ZONE } from '../common/time/local-evening';

export interface SyncResult {
  /** Evenings newly marked as "not coming" on the person's behalf. */
  declined: number;
  /** Derived declines withdrawn because no period covers them any more. */
  withdrawn: number;
}

/**
 * Turns absence periods into per-evening answers, and takes them back again.
 *
 * **Why materialise at all.** A purely derived absence would have to be
 * re-checked in every place that asks "who is coming" — the host, the guest
 * count, the capacity rule. Writing the answer down means all of that keeps
 * working unchanged, and the absence shows up in the attendance list where
 * people look for it. The period stays the source of truth: these rows are
 * rebuilt from it and never edited by hand.
 *
 * **Why it runs forward only.** Evenings that already happened are history. A
 * holiday entered after the fact should not rewrite who was there.
 *
 * The rows go through the ordinary attendance path, so the drop-out and
 * capacity notifications from Phase 8 fire on their own — a holiday declared
 * weeks ahead reaches the host exactly like a manual cancellation.
 */
@Injectable()
export class AbsenceSyncService {
  private readonly logger = new Logger(AbsenceSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meetingNotifications: MeetingNotificationService,
    private readonly cancellations: MeetingCancellationService,
    private readonly roleRelease: RoleReleaseService,
    private readonly autoAttendance: AutoAttendanceService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Rebuilds the derived answers for one person from their periods.
   *
   * Scoped to a person rather than the whole group because that is what
   * changes: adding, editing or deleting a period affects nobody else. Editing
   * is therefore "delete what no longer applies, add what now does", with no
   * need to know what the period looked like before.
   */
  async syncPerson(
    hauskreisId: string,
    personId: string,
    options: { now?: Date; notify?: boolean } = {},
  ): Promise<SyncResult> {
    const today = await this.clock.today(hauskreisId, options.now);

    const [periods, meetings] = await Promise.all([
      this.prisma.absencePeriod.findMany({
        where: { hauskreisId, personId, endDate: { gte: today } },
        select: { personId: true, startDate: true, endDate: true },
      }),
      // Ohne Filter auf `status`, und das ist neu: seit ein Abend ausfallen
      // kann, *weil* alle abgesagt haben, ist die Absage eine Folge dieser
      // Zeilen und keine Vorbedingung mehr. Wer einen Urlaub wieder löscht,
      // muss auch aus einem abgesagten Abend wieder herauskommen — sonst bliebe
      // er abgesagt mit einer Absage, die es nicht mehr gibt.
      this.prisma.meeting.findMany({
        where: { hauskreisId, date: { gte: today } },
        select: {
          id: true,
          date: true,
          attendances: {
            where: { personId },
            select: { status: true, source: true },
          },
        },
      }),
    ]);

    const calendar = new AbsenceCalendar(periods);

    const toDecline: string[] = [];
    const toWithdraw: string[] = [];

    for (const meeting of meetings) {
      const existing = meeting.attendances[0];
      const away = calendar.isAway(personId, meeting.date);

      // A deliberate answer outranks a blanket date range in both directions:
      // somebody who said "doch, ich komme" keeps that, and a manual decline is
      // not ours to withdraw.
      //
      // Eine **automatische** Zusage ist keine ausdrückliche. Sie weicht dem
      // Zeitraum — sonst stünde ein eingetragener Urlaub gegen ein „dabei", das
      // niemand je getippt hat, und der Schalter machte jeden Urlaub still
      // wirkungslos.
      if (existing && existing.source === AttendanceSource.SELF) {
        continue;
      }

      const derived = existing?.source === AttendanceSource.ABSENCE;

      if (away && !derived) {
        toDecline.push(meeting.id);
      } else if (!away && derived) {
        toWithdraw.push(meeting.id);
      }
    }

    if (toWithdraw.length > 0) {
      await this.prisma.meetingAttendance.deleteMany({
        where: {
          personId,
          meetingId: { in: toWithdraw },
          source: AttendanceSource.ABSENCE,
        },
      });

      // Die Antwort steht mit in der Antwort des Termins — ohne den Griff
      // bliebe sein ETag stehen und die Detailseite mit ihm (`touchMeetings`).
      await touchMeetings(this.prisma, toWithdraw);

      // Ein gelöschter Urlaub gibt den Abend wieder frei — und wer
      // grundsätzlich dabei ist, ist es dann auch wieder. Ohne das bliebe nach
      // einem zurückgenommenen Urlaub „weiß noch nicht" stehen, obwohl der
      // Schalter etwas anderes sagt.
      await this.autoAttendance.apply(hauskreisId, { personId, now: today });
    }

    if (toDecline.length > 0) {
      // Erst die abgeleitete Zusage wegräumen: `skipDuplicates` unten ließe sie
      // sonst stehen, und der Abend bliebe auf „dabei", obwohl die Person
      // verreist ist.
      //
      // `not: SELF` und keine Aufzählung: Gemeint ist jede Zusage, die niemand
      // ausgesprochen hat — die Voreinstellung (`AUTO`) wie die aus einer Rolle
      // (`ROLE`). Eine Aufzählung müsste beim nächsten Wert nachgezogen werden,
      // und wird sie es nicht, bleibt die Zeile stehen, `skipDuplicates` lässt
      // die Absage fallen und der Urlaub ist still wirkungslos. Eine
      // `ABSENCE`-Zeile kommt hier ohnehin nicht an: Die zählt oben als
      // `derived` und landet gar nicht erst in dieser Liste.
      await this.prisma.meetingAttendance.deleteMany({
        where: {
          personId,
          meetingId: { in: toDecline },
          source: { not: AttendanceSource.SELF },
        },
      });

      await this.prisma.meetingAttendance.createMany({
        data: toDecline.map((meetingId) => ({
          meetingId,
          personId,
          status: AttendanceStatus.ABSENT,
          source: AttendanceSource.ABSENCE,
        })),
        skipDuplicates: true,
      });

      // Wie oben: die neue Absage steht in der Antwort des Termins.
      await touchMeetings(this.prisma, toDecline);
    }

    // Ein Urlaub macht Rollen genauso frei wie eine Absage von Hand — sonst
    // bliebe im Plan ein Gastgeber stehen, der nachweislich verreist ist.
    // Läuft auch ohne `notify`: freigeben ist eine Änderung an den Daten,
    // nicht eine Nachricht darüber.
    const released = new Map<string, ReleasedRoles>();

    for (const meetingId of toDecline) {
      released.set(
        meetingId,
        await this.roleRelease.releaseFor(meetingId, personId),
      );
    }

    if (options.notify !== false) {
      // Sequential on purpose: each one may look at the same meeting's guest
      // count, and the capacity offer should see the finished picture.
      for (const meetingId of toDecline) {
        await this.meetingNotifications.handleDecline(
          meetingId,
          personId,
          released.get(meetingId),
        );
      }
    }

    // Ein Urlaub kann derjenige Ausfall sein, mit dem alle abgesagt haben — und
    // ein gelöschter Urlaub derjenige, der den Abend wieder aufleben lässt.
    for (const meetingId of [...toDecline, ...toWithdraw]) {
      await this.cancellations.reconcile(meetingId);
    }

    if (toDecline.length > 0 || toWithdraw.length > 0) {
      this.logger.log(
        `Absence sync for person ${personId}: ${toDecline.length} declined, ${toWithdraw.length} withdrawn`,
      );
    }

    return { declined: toDecline.length, withdrawn: toWithdraw.length };
  }

  /**
   * Catches up every group, after the nightly meeting generator has run.
   *
   * A separate job rather than a call at the end of the generator: the absence
   * module already depends on the meeting module for the notifications, and
   * reaching back the other way would make the two circular. Checking daily is
   * also self-healing, in the same spirit as the prayer buddy rotation — it
   * asks rather than assumes.
   */
  @Cron('30 3 * * *', {
    name: 'sync-absences',
    timeZone: CRON_TIME_ZONE,
  })
  async handleCron(): Promise<void> {
    const hauskreise = await this.prisma.hauskreis.findMany({
      select: { id: true },
    });

    await Promise.all(
      hauskreise.map((hauskreis) => this.syncAll(hauskreis.id)),
    );
  }

  /**
   * Catches up everyone in a group.
   *
   * Needed because meetings are generated ahead: an evening created today may
   * fall inside a holiday that was entered weeks ago, and nothing else would
   * ever revisit it.
   */
  async syncAll(
    hauskreisId: string,
    options: { now?: Date; notify?: boolean } = {},
  ): Promise<SyncResult> {
    const people = await this.prisma.person.findMany({
      where: { hauskreisId, active: true, absences: { some: {} } },
      select: { id: true },
    });

    const results = await Promise.all(
      people.map((person) => this.syncPerson(hauskreisId, person.id, options)),
    );

    return results.reduce(
      (total, result) => ({
        declined: total.declined + result.declined,
        withdrawn: total.withdrawn + result.withdrawn,
      }),
      { declined: 0, withdrawn: 0 },
    );
  }
}
