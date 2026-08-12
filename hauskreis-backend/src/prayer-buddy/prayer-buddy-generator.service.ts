import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { appPath } from '../notification/app-paths';
import { PrayerBuddyService, type Assignment } from './prayer-buddy.service';
import { buildGroups, repairGroups } from './grouping';
import { NotificationType } from '../../generated/prisma/enums';
import { addDays } from '../meeting/meeting-schedule';
import { GroupClockService } from '../meeting/group-clock.service';

/**
 * How many rounds should always be planned, the running one included.
 *
 * The same idea as `MEETINGS_AHEAD`: you should be able to look ahead and see
 * who you will be praying with, not just who you are praying with today. Five
 * is roughly a quarter of a year at a fortnightly rhythm — far enough to be
 * useful, close enough that a change of rhythm or a new member does not
 * invalidate a year of plans.
 */
export const ROUNDS_AHEAD = 5;

export interface RotationResult {
  /** Null when there was nothing to do, or too few people to pair. */
  assignment: Assignment | null;
  /**
   * Whether a *different* round is running now than before the call.
   *
   * True both when a round was freshly built and when a planned one was pulled
   * forward — for whoever asked, the outcome is the same: new buddies as of
   * today.
   */
  created: boolean;
  notified: number;
}

export interface PlanningResult {
  /** Rounds newly built by this run. */
  created: number;
}

export interface ReplanResult {
  /** Gruppen der laufenden Runde, deren Besetzung sich geändert hat. */
  repaired: number;
  /** Verworfene künftige Gruppen. */
  discarded: number;
  /** Runden, die danach neu geplant wurden. */
  planned: number;
  notified: number;
}

@Injectable()
export class PrayerBuddyGeneratorService {
  private readonly logger = new Logger(PrayerBuddyGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly buddies: PrayerBuddyService,
    private readonly notifications: NotificationService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Daily rather than every two weeks, and it checks instead of assuming.
   *
   * A fortnightly cron would silently skip a rotation if the server happened
   * to be down that morning. Asking "are five rounds planned" every day is
   * self-healing and costs one query when the answer is yes.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'rotate-prayer-buddies' })
  async handleCron(): Promise<void> {
    const hauskreise = await this.prisma.hauskreis.findMany({
      select: { id: true },
    });

    let created = 0;
    let notified = 0;

    for (const hauskreis of hauskreise) {
      const result = await this.ensureRoundsPlanned(hauskreis.id);
      created += result.created;
      notified += await this.announceCurrentRound(hauskreis.id);
    }

    if (created > 0) {
      this.logger.log(`Planned ${created} prayer buddy round(s)`);
    }

    if (notified > 0) {
      this.logger.log(`Announced a round to ${notified} person/people`);
    }
  }

  /**
   * Tops the plan back up to `ROUNDS_AHEAD` rounds.
   *
   * Built one at a time on purpose, not in one batch: each round is grouped
   * from the history *including* the rounds just planned. Without re-reading
   * it, all five would come out identical — the algorithm is deterministic, so
   * the same input gives the same answer five times over.
   *
   * Nothing is announced here. A round is announced when it begins (see
   * `announceCurrentRound`); telling people in October who they will pray with
   * in December is not a reminder, it is noise.
   */
  async ensureRoundsPlanned(
    hauskreisId: string,
    now = new Date(),
  ): Promise<PlanningResult> {
    const today = await this.clock.today(hauskreisId, now);
    let created = 0;

    for (let attempt = 0; attempt < ROUNDS_AHEAD; attempt += 1) {
      const planned = await this.countRoundsFrom(hauskreisId, today);

      if (planned >= ROUNDS_AHEAD) {
        break;
      }

      const start = await this.nextRoundStart(hauskreisId, today);
      const result = await this.assign(hauskreisId, start, { notify: false });

      if (!result.created) {
        // Fewer than two active people. Not an error, but retrying four more
        // times would not change the answer.
        break;
      }

      created += 1;
    }

    return { created };
  }

  /**
   * Announces the round that is running today.
   *
   * Every day rather than only on the first: `NotificationService.notify`
   * deduplicates on the group id, so the second call and every one after it
   * are free. That turns a missed morning — server down, push not yet
   * configured — into a late notification instead of none at all.
   */
  async announceCurrentRound(
    hauskreisId: string,
    now = new Date(),
  ): Promise<number> {
    const current = await this.buddies.findCurrent(hauskreisId, now);

    return current ? this.announce(current) : 0;
  }

  /**
   * Zieht die Rotation nach, wenn sich die Gruppe geändert hat.
   *
   * Bis hierher war die Teilnehmerliste eine Momentaufnahme: gelesen wurde sie
   * nur beim Bauen einer Runde, und der tägliche Lauf füllt bloß auf. Wer ging,
   * stand danach in bis zu fünf geplanten Runden; wer kam, wartete auf seine
   * ersten Buddys, bis alle fünf abgelaufen waren.
   *
   * Zwei Zeiträume, zwei Antworten:
   *
   * - **Die laufende Runde wird repariert, nicht neu gewürfelt** (siehe
   *   `repairGroups`). Sie läuft schon.
   * - **Künftige Runden werden verworfen und neu geplant.** Sie sind gegen eine
   *   Gruppe gebaut, die es nicht mehr gibt.
   *
   * Verworfen heißt hier **gelöscht**, anders als beim Neuwürfeln von Hand: dort
   * ist die verworfene Aufteilung die eigentliche Information („diese nicht"),
   * hier wäre sie eine Falschaussage. Diese Paarungen haben nie stattgefunden
   * und dürfen die Wiederholungs-Vermeidung nicht belasten — sonst mieden sich
   * zwei Menschen wegen einer Runde, die keiner von beiden erlebt hat.
   */
  async replanAfterMembershipChange(
    hauskreisId: string,
    options: { now?: Date; notify?: boolean } = {},
  ): Promise<ReplanResult> {
    const now = options.now ?? new Date();
    const today = await this.clock.today(hauskreisId, now);

    const repair = await this.repairRunningRound(hauskreisId, today, {
      notify: options.notify ?? true,
    });

    const discarded = await this.prisma.prayerBuddyGroup.deleteMany({
      where: { hauskreisId, periodStart: { gt: today } },
    });

    const { created } = await this.ensureRoundsPlanned(hauskreisId, now);

    if (repair.repaired > 0 || discarded.count > 0) {
      this.logger.log(
        `Replanned prayer buddies for Hauskreis ${hauskreisId}: ` +
          `${repair.repaired} group(s) repaired, ${discarded.count} discarded, ${created} planned`,
      );
    }

    return {
      repaired: repair.repaired,
      discarded: discarded.count,
      planned: created,
      notified: repair.notified,
    };
  }

  /** Bringt die Runde, die heute läuft, auf die aktuelle Besetzung. */
  private async repairRunningRound(
    hauskreisId: string,
    today: Date,
    options: { notify: boolean },
  ): Promise<{ repaired: number; notified: number }> {
    const [groups, people] = await Promise.all([
      this.prisma.prayerBuddyGroup.findMany({
        where: {
          hauskreisId,
          discardedAt: null,
          periodStart: { lte: today },
          periodEnd: { gte: today },
        },
        select: { id: true, members: { select: { personId: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.person.findMany({
        where: { hauskreisId, active: true },
        select: { id: true },
      }),
    ]);

    if (groups.length === 0) {
      return { repaired: 0, notified: 0 };
    }

    const before = new Map(
      groups.map((group) => [
        group.id,
        new Set(group.members.map((member) => member.personId)),
      ]),
    );

    const after = repairGroups(
      groups.map((group) => ({
        id: group.id,
        memberIds: group.members.map((member) => member.personId),
      })),
      new Set(people.map((person) => person.id)),
    );

    const departures: { groupId: string; personIds: string[] }[] = [];
    const arrivals: { groupId: string; personId: string }[] = [];
    const emptied: string[] = [];
    const touched: string[] = [];

    for (const group of after) {
      const was = before.get(group.id) as Set<string>;
      const now = new Set(group.memberIds);

      const gone = [...was].filter((personId) => !now.has(personId));
      const came = [...now].filter((personId) => !was.has(personId));

      if (gone.length === 0 && came.length === 0) {
        continue;
      }

      touched.push(group.id);

      if (gone.length > 0) {
        departures.push({ groupId: group.id, personIds: gone });
      }

      for (const personId of came) {
        arrivals.push({ groupId: group.id, personId });
      }

      if (now.size === 0) {
        emptied.push(group.id);
      }
    }

    if (touched.length === 0) {
      return { repaired: 0, notified: 0 };
    }

    await this.prisma.$transaction([
      ...departures.map((departure) =>
        this.prisma.prayerBuddyGroupMember.deleteMany({
          where: {
            groupId: departure.groupId,
            personId: { in: departure.personIds },
          },
        }),
      ),
      ...arrivals.map((arrival) =>
        this.prisma.prayerBuddyGroupMember.create({ data: arrival }),
      ),
      // Eine Gruppe ohne Mitglieder ist keine mehr. Bliebe sie stehen, stünde
      // sie leer im Archiv und zählte als Zeitraum mit.
      ...(emptied.length > 0
        ? [
            this.prisma.prayerBuddyGroup.deleteMany({
              where: { id: { in: emptied } },
            }),
          ]
        : []),
    ]);

    const announce = touched.filter((id) => !emptied.includes(id));

    if (!options.notify || announce.length === 0) {
      return { repaired: touched.length, notified: 0 };
    }

    // `hasBeenSent` prüft auf `(Person, Art, Gruppe)`, und alle drei sind
    // dieselben geblieben — die zweite Nachricht würde als Dublette der ersten
    // verschluckt. Der Merkposten wird deshalb weggeräumt: einmal je Änderung,
    // nicht einmal je Gruppe. Dasselbe Muster wie bei `announceStatusChange`.
    await this.prisma.notificationLog.deleteMany({
      where: {
        type: NotificationType.PRAYER_BUDDY_ASSIGNED,
        relatedGroupId: { in: announce },
      },
    });

    const current = await this.buddies.findCurrent(hauskreisId, today);

    if (!current) {
      return { repaired: touched.length, notified: 0 };
    }

    // Nur die berührten Gruppen. Für wen sich nichts geändert hat, ist das
    // keine Neuigkeit — und eine Nachricht, die nichts sagt, kostet Vertrauen
    // in alle anderen.
    const notified = await this.announce({
      ...current,
      groups: current.groups.filter((group) => announce.includes(group.id)),
    });

    return { repaired: touched.length, notified };
  }

  /**
   * Re-assigns straight away, mid-period if need be.
   *
   * First the running round makes way, in one of two deliberately different
   * ways:
   *
   * - Started **today** — it is marked discarded. Nobody has lived with it yet,
   *   so it stays out of the archive; it stays in the avoidance data, which is
   *   what makes a second roll produce something different rather than the
   *   identical split.
   * - Started **earlier** — it is closed off yesterday. Those days did happen,
   *   and the pairings stay on record so the repeat avoidance knows about them.
   *
   * Then the **next planned round is pulled forward** to start today, and
   * everything behind it slides along by the same number of days. It is not
   * thrown away and re-rolled: it was built from the same history and against
   * the same people, so a fresh roll would mostly reproduce it — and the point
   * of planning ahead is that the plan means something. Afterwards the tail is
   * topped back up to `ROUNDS_AHEAD`.
   *
   * Only when there is no planned round to pull forward is a new one built.
   */
  async rotateNow(
    hauskreisId: string,
    options: { notify?: boolean; now?: Date } = {},
  ): Promise<RotationResult> {
    const today = await this.clock.today(hauskreisId, options.now);

    await this.closeRunningRound(hauskreisId, today);

    const next = await this.prisma.prayerBuddyGroup.findFirst({
      where: { hauskreisId, discardedAt: null, periodStart: { gt: today } },
      orderBy: { periodStart: 'asc' },
      select: { periodStart: true },
    });

    let assignment: Assignment | null;
    let created: boolean;

    if (next) {
      await this.shiftRoundsFrom(
        hauskreisId,
        next.periodStart,
        daysBetween(next.periodStart, today),
      );
      assignment = await this.buddies.findCurrent(hauskreisId, today);
      created = assignment !== null;
    } else {
      const result = await this.assign(hauskreisId, today, { notify: false });
      assignment = result.assignment;
      created = result.created;
    }

    // Vorne eine Runde entnommen heißt hinten eine nachlegen.
    await this.ensureRoundsPlanned(hauskreisId, today);

    const notified =
      (options.notify ?? true) && assignment
        ? await this.announce(assignment)
        : 0;

    return { assignment, created, notified };
  }

  /** Ends or discards whatever round covers today, so a new one can start. */
  private async closeRunningRound(
    hauskreisId: string,
    today: Date,
  ): Promise<void> {
    const running = await this.prisma.prayerBuddyGroup.findMany({
      where: {
        hauskreisId,
        discardedAt: null,
        periodStart: { lte: today },
        periodEnd: { gte: today },
      },
      select: { id: true, periodStart: true },
    });

    if (running.length === 0) {
      return;
    }

    const ids = running.map((group) => group.id);

    if (running[0].periodStart.getTime() === today.getTime()) {
      // Marked, not deleted: the next roll needs to know this split was
      // rejected, or it would deterministically produce the same one again.
      await this.prisma.prayerBuddyGroup.updateMany({
        where: { id: { in: ids } },
        data: { discardedAt: new Date() },
      });
      return;
    }

    await this.prisma.prayerBuddyGroup.updateMany({
      where: { id: { in: ids } },
      data: { periodEnd: addDays(today, -1) },
    });
  }

  /**
   * Moves every planned round from `fromStart` onwards by `days`.
   *
   * Row by row rather than one `updateMany`: the new dates are computed from
   * each row's own, and that is arithmetic Prisma cannot express in an update.
   * At five rounds of at most five groups it is a couple of dozen rows.
   */
  private async shiftRoundsFrom(
    hauskreisId: string,
    fromStart: Date,
    days: number,
  ): Promise<void> {
    if (days === 0) {
      return;
    }

    const groups = await this.prisma.prayerBuddyGroup.findMany({
      where: {
        hauskreisId,
        discardedAt: null,
        periodStart: { gte: fromStart },
      },
      select: { id: true, periodStart: true, periodEnd: true },
    });

    await this.prisma.$transaction(
      groups.map((group) =>
        this.prisma.prayerBuddyGroup.update({
          where: { id: group.id },
          data: {
            periodStart: addDays(group.periodStart, days),
            periodEnd: addDays(group.periodEnd, days),
          },
        }),
      ),
    );
  }

  /** How many rounds are running or still to come. */
  private async countRoundsFrom(
    hauskreisId: string,
    today: Date,
  ): Promise<number> {
    const periods = await this.prisma.prayerBuddyGroup.groupBy({
      by: ['periodStart'],
      where: { hauskreisId, discardedAt: null, periodEnd: { gte: today } },
    });

    return periods.length;
  }

  /**
   * Where the next round begins: the day after the last one planned.
   *
   * Never in the past. If the last round ended weeks ago — the server was off,
   * or the group paused — the next one starts today rather than back-filling
   * rounds nobody lived through.
   */
  private async nextRoundStart(
    hauskreisId: string,
    today: Date,
  ): Promise<Date> {
    const last = await this.prisma.prayerBuddyGroup.findFirst({
      where: { hauskreisId, discardedAt: null },
      orderBy: { periodEnd: 'desc' },
      select: { periodEnd: true },
    });

    if (!last) {
      return today;
    }

    const next = addDays(last.periodEnd, 1);

    return next.getTime() < today.getTime() ? today : next;
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
              url: appPath.prayerBuddies(),
            },
          });
        }),
      ),
    );

    return results.filter((result) => result.skipped === 0).length;
  }
}

/** Whole days from `from` to `to`; negative when `to` lies earlier. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
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
