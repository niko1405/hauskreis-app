import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPage } from '../common/http/pagination';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import type { IfMatchCondition } from '../common/http/etag';
import { addDays, toUtcDate } from '../meeting/meeting-schedule';
import type {
  ListPrayerBuddiesQueryDto,
  UpdateCycleConfigDto,
} from './dto/prayer-buddy.dto';

const groupInclude = {
  members: {
    select: { person: { select: { id: true, name: true } } },
  },
} as const;

/** All the groups sharing one period — together, one assignment. */
export interface Assignment {
  periodStart: string;
  periodEnd: string;
  groups: {
    id: string;
    members: { id: string; name: string }[];
  }[];
}

@Injectable()
export class PrayerBuddyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The cycle settings, created on first read.
   *
   * Lazily rather than when a Hauskreis is created: a group that never looks at
   * prayer buddies should not carry a config row, and this way the default is
   * in one place.
   */
  async getConfig(hauskreisId: string) {
    const existing = await this.prisma.prayerBuddyCycleConfig.findUnique({
      where: { hauskreisId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.prayerBuddyCycleConfig.create({
      data: { hauskreisId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
  }

  /**
   * Changes the rhythm. Takes effect at the **next** rotation — the running
   * assignment keeps the dates it was given, so nobody's current buddies
   * change under them just because the setting moved.
   */
  async updateConfig(
    hauskreisId: string,
    dto: UpdateCycleConfigDto,
    updatedByPersonId: string | null,
    condition?: IfMatchCondition,
  ) {
    await this.getConfig(hauskreisId);

    return updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.prayerBuddyCycleConfig.updateMany({
          where: { hauskreisId, ...versionConstraint },
          data: {
            periodLengthWeeks: dto.periodLengthWeeks,
            updatedByPersonId,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.prayerBuddyCycleConfig.findUnique({
          where: { hauskreisId },
        }),
      reload: () => this.getConfig(hauskreisId),
      notFoundMessage: `No prayer buddy config for Hauskreis ${hauskreisId}`,
    });
  }

  /** The assignment covering `on`, or null if nobody is assigned right now. */
  async findCurrent(
    hauskreisId: string,
    on = new Date(),
  ): Promise<Assignment | null> {
    const today = toUtcDate(on);

    const groups = await this.prisma.prayerBuddyGroup.findMany({
      where: {
        hauskreisId,
        discardedAt: null,
        periodStart: { lte: today },
        periodEnd: { gte: today },
      },
      include: groupInclude,
      orderBy: { createdAt: 'asc' },
    });

    return groups.length > 0 ? toAssignment(groups) : null;
  }

  /** Past and present assignments, newest first — the archive view. */
  async findAll(hauskreisId: string, query: ListPrayerBuddiesQueryDto) {
    const [periods, total] = await Promise.all([
      this.prisma.prayerBuddyGroup.groupBy({
        by: ['periodStart', 'periodEnd'],
        // Re-rolled groupings never took effect and have no place in the
        // archive, even though the avoidance still counts them.
        where: { hauskreisId, discardedAt: null },
        orderBy: { periodStart: 'desc' },
        take: query.take,
        skip: query.skip,
      }),
      this.prisma.prayerBuddyGroup
        .groupBy({
          by: ['periodStart'],
          where: { hauskreisId, discardedAt: null },
        })
        .then((rows) => rows.length),
    ]);

    const groups = await this.prisma.prayerBuddyGroup.findMany({
      where: {
        hauskreisId,
        discardedAt: null,
        periodStart: { in: periods.map((period) => period.periodStart) },
      },
      include: groupInclude,
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'asc' }],
    });

    const byPeriod = new Map<string, typeof groups>();
    for (const group of groups) {
      const key = isoDate(group.periodStart);
      byPeriod.set(key, [...(byPeriod.get(key) ?? []), group]);
    }

    const items = periods.map((period) =>
      toAssignment(byPeriod.get(isoDate(period.periodStart)) ?? []),
    );

    return toPage(items, total, query);
  }

  /**
   * Everything ever grouped, oldest first — the basis for repeat avoidance.
   *
   * Includes discarded groupings on purpose. An admin who re-rolls wants a
   * *different* split; without the one they just rejected in here, the
   * deterministic algorithm would hand back exactly the same one.
   */
  async findHistory(hauskreisId: string) {
    const groups = await this.prisma.prayerBuddyGroup.findMany({
      where: { hauskreisId },
      select: {
        periodStart: true,
        members: { select: { personId: true } },
      },
      orderBy: { periodStart: 'asc' },
    });

    // Periods get consecutive indices rather than raw dates: the algorithm
    // asks "how many rotations ago", which stays right even if a period was
    // cut short or the rhythm changed.
    const periodIndex = new Map<string, number>();
    for (const group of groups) {
      const key = isoDate(group.periodStart);
      if (!periodIndex.has(key)) {
        periodIndex.set(key, periodIndex.size);
      }
    }

    return {
      nextPeriodIndex: periodIndex.size,
      groupings: groups.map((group) => ({
        periodIndex: periodIndex.get(isoDate(group.periodStart)) as number,
        memberIds: group.members.map((member) => member.personId),
      })),
    };
  }

  /** The last day of a period starting on `start`. */
  periodEndFor(start: Date, periodLengthWeeks: number): Date {
    return addDays(start, periodLengthWeeks * 7 - 1);
  }
}

function toAssignment(
  groups: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    members: { person: { id: string; name: string } }[];
  }[],
): Assignment {
  return {
    periodStart: isoDate(groups[0].periodStart),
    periodEnd: isoDate(groups[0].periodEnd),
    groups: groups.map((group) => ({
      id: group.id,
      members: group.members.map((member) => member.person),
    })),
  };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
