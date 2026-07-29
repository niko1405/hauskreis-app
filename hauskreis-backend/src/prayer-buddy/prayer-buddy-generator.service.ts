import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { PrayerBuddyService, type Assignment } from './prayer-buddy.service';
import { buildGroups } from './grouping';
import { NotificationType } from '../../generated/prisma/enums';
import { addDays, toUtcDate } from '../meeting/meeting-schedule';

export interface RotationResult {
  /** Null when there was nothing to do, or too few people to pair. */
  assignment: Assignment | null;
  created: boolean;
  notified: number;
}

@Injectable()
export class PrayerBuddyGeneratorService {
  private readonly logger = new Logger(PrayerBuddyGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly buddies: PrayerBuddyService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Daily rather than every two weeks, and it checks instead of assuming.
   *
   * A fortnightly cron would silently skip a rotation if the server happened
   * to be down that morning. Asking "is anybody assigned today" every day is
   * self-healing and costs one query.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'rotate-prayer-buddies' })
  async handleCron(): Promise<void> {
    const hauskreise = await this.prisma.hauskreis.findMany({
      select: { id: true },
    });

    const results = await Promise.all(
      hauskreise.map((hauskreis) => this.ensureCurrentAssignment(hauskreis.id)),
    );

    const created = results.filter((result) => result.created).length;

    if (created > 0) {
      this.logger.log(`Assigned prayer buddies for ${created} group(s)`);
    }
  }

  /** Creates an assignment for today if none covers it. */
  async ensureCurrentAssignment(
    hauskreisId: string,
    now = new Date(),
  ): Promise<RotationResult> {
    const current = await this.buddies.findCurrent(hauskreisId, now);

    if (current) {
      return { assignment: current, created: false, notified: 0 };
    }

    return this.assign(hauskreisId, toUtcDate(now), { notify: true });
  }

  /**
   * Re-assigns straight away, mid-period if need be.
   *
   * Two cases, deliberately different:
   *
   * - Started **today** — the running assignment is marked discarded. Nobody
   *   has lived with it yet, so it stays out of the archive; it stays in the
   *   avoidance data, which is what makes a second roll produce something
   *   different rather than the identical split.
   * - Started **earlier** — it is closed off yesterday and a fresh period
   *   starts today. Those days did happen, and the pairings stay on record so
   *   the repeat avoidance knows about them.
   *
   * Either way the new period runs a full cycle from today: the point of
   * re-assigning is that the new groups get their proper stretch together.
   */
  async rotateNow(
    hauskreisId: string,
    options: { notify?: boolean; now?: Date } = {},
  ): Promise<RotationResult> {
    const today = toUtcDate(options.now ?? new Date());

    const running = await this.prisma.prayerBuddyGroup.findMany({
      where: {
        hauskreisId,
        discardedAt: null,
        periodStart: { lte: today },
        periodEnd: { gte: today },
      },
      select: { id: true, periodStart: true },
    });

    if (running.length > 0) {
      const startedToday = running[0].periodStart.getTime() === today.getTime();

      if (startedToday) {
        // Marked, not deleted: the next roll needs to know this split was
        // rejected, or it would deterministically produce the same one again.
        await this.prisma.prayerBuddyGroup.updateMany({
          where: { id: { in: running.map((group) => group.id) } },
          data: { discardedAt: new Date() },
        });
      } else {
        await this.prisma.prayerBuddyGroup.updateMany({
          where: { id: { in: running.map((group) => group.id) } },
          data: { periodEnd: addDays(today, -1) },
        });
      }
    }

    return this.assign(hauskreisId, today, {
      notify: options.notify ?? true,
    });
  }

  private async assign(
    hauskreisId: string,
    periodStart: Date,
    options: { notify: boolean },
  ): Promise<RotationResult> {
    const [people, config, history] = await Promise.all([
      this.prisma.person.findMany({
        where: { hauskreisId, active: true },
        select: { id: true, name: true },
      }),
      this.buddies.getConfig(hauskreisId),
      this.buddies.findHistory(hauskreisId),
    ]);

    // Absence periods are deliberately ignored here, unlike everywhere else.
    // Praying for each other does not depend on being in town, and skipping a
    // round would cost the person the one thing a holiday does not interrupt.
    const groups = buildGroups({
      people,
      history: history.groupings,
      periodIndex: history.nextPeriodIndex,
    });

    if (groups.length === 0) {
      // Fewer than two active people. Not an error — just nothing to pair.
      return { assignment: null, created: false, notified: 0 };
    }

    const periodEnd = this.buddies.periodEndFor(
      periodStart,
      config.periodLengthWeeks,
    );

    await this.prisma.$transaction(
      groups.map((group) =>
        this.prisma.prayerBuddyGroup.create({
          data: {
            hauskreisId,
            periodStart,
            periodEnd,
            members: {
              create: group.members.map((member) => ({
                personId: member.id,
              })),
            },
          },
        }),
      ),
    );

    const assignment = (await this.buddies.findCurrent(
      hauskreisId,
      periodStart,
    )) as Assignment;

    const notified = options.notify ? await this.announce(assignment) : 0;

    return { assignment, created: true, notified };
  }

  /** Tells everyone who they are praying with, once per assignment. */
  private async announce(assignment: Assignment): Promise<number> {
    const results = await Promise.all(
      assignment.groups.flatMap((group) =>
        group.members.map((member) => {
          const others = group.members
            .filter((other) => other.id !== member.id)
            .map((other) => other.name);

          return this.notifications.notify({
            personId: member.id,
            type: NotificationType.PRAYER_BUDDY_ASSIGNED,
            // The group id is what makes each rotation its own notification.
            relatedGroupId: group.id,
            payload: {
              title: 'Neue Gebetsbuddys',
              body: `Bis ${formatDate(assignment.periodEnd)} betest du mit ${formatNames(others)}.`,
              url: '/prayer-buddies',
            },
          });
        }),
      ),
    );

    return results.filter((result) => result.skipped === 0).length;
  }
}

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

function formatDate(iso: string): string {
  return dateFormat.format(new Date(`${iso}T00:00:00.000Z`));
}

/** "Anna und Ben", "Anna, Ben und Carla" — the warm tone from CLAUDE.md §9. */
function formatNames(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? 'niemandem';
  }

  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
}
