import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import { AbsenceSyncService } from './absence-sync.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import { toPage } from '../common/http/pagination';
import { toUtcDate } from '../meeting/meeting-schedule';
import { GroupClockService } from '../meeting/group-clock.service';
import type { HauskreisMembership } from '../auth/auth.types';
import { PersonRole } from '../../generated/prisma/enums';
import type { IfMatchCondition } from '../common/http/etag';
import type {
  CreateAbsenceDto,
  ListAbsencesQueryDto,
  UpdateAbsenceDto,
} from './dto/absence.dto';

const absenceInclude = {
  person: { select: personRefSelect },
} as const;

/**
 * Absence periods, and keeping the derived answers in step with them.
 *
 * Every write ends in a sync, so "ich bin weg" and "ich komme an dem Abend
 * nicht" never drift apart. The sync is deliberately part of the request rather
 * than a nightly job: entering a holiday and then seeing yourself still down as
 * coming would look broken.
 */
@Injectable()
export class AbsenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: AbsenceSyncService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Everyone's absences, not just your own — who is away is exactly what the
   * group needs when planning an evening.
   */
  async findAll(hauskreisId: string, query: ListAbsencesQueryDto) {
    const today = await this.clock.today(hauskreisId);

    const where = {
      hauskreisId,
      ...(query.personId ? { personId: query.personId } : {}),
      // "upcoming" keeps anything that has not fully passed, including a period
      // that started last week and still runs.
      ...(query.scope === 'upcoming' ? { endDate: { gte: today } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.absencePeriod.findMany({
        where,
        include: absenceInclude,
        orderBy: { startDate: 'asc' },
        take: query.take,
        skip: query.skip,
      }),
      this.prisma.absencePeriod.count({ where }),
    ]);

    return toPage(items, total, query);
  }

  async findOne(hauskreisId: string, id: string) {
    const absence = await this.prisma.absencePeriod.findFirst({
      where: { id, hauskreisId },
      include: absenceInclude,
    });

    if (!absence) {
      throw new NotFoundException(`Absence ${id} not found`);
    }

    return absence;
  }

  async create(
    hauskreisId: string,
    dto: CreateAbsenceDto,
    actor: { personId: string; isAdmin: boolean },
  ) {
    const personId = dto.personId ?? actor.personId;
    this.assertMayManage(personId, actor);
    await this.assertPersonBelongsToHauskreis(hauskreisId, personId);

    const absence = await this.prisma.absencePeriod.create({
      data: {
        hauskreisId,
        personId,
        startDate: toUtcDate(dto.startDate),
        endDate: toUtcDate(dto.endDate),
        reason: dto.reason ?? null,
      },
      include: absenceInclude,
    });

    await this.sync.syncPerson(hauskreisId, personId);

    return absence;
  }

  async update(
    hauskreisId: string,
    id: string,
    dto: UpdateAbsenceDto,
    actor: { personId: string; isAdmin: boolean },
    condition?: IfMatchCondition,
  ) {
    const existing = await this.findOne(hauskreisId, id);
    this.assertMayManage(existing.personId, actor);

    const updated = await updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.absencePeriod.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            startDate: toUtcDate(dto.startDate),
            endDate: toUtcDate(dto.endDate),
            reason: dto.reason,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.absencePeriod.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id),
      notFoundMessage: `Absence ${id} not found`,
    });

    // Shortening a period has to give evenings back, not just take them away —
    // the sync rebuilds from scratch and covers both directions.
    await this.sync.syncPerson(hauskreisId, existing.personId);

    return updated;
  }

  async remove(
    hauskreisId: string,
    id: string,
    actor: { personId: string; isAdmin: boolean },
  ) {
    const existing = await this.findOne(hauskreisId, id);
    this.assertMayManage(existing.personId, actor);

    await this.prisma.absencePeriod.delete({ where: { id } });
    await this.sync.syncPerson(hauskreisId, existing.personId);
  }

  /**
   * Own absences are everyone's business to manage; other people's are the
   * admin's. Entering a holiday for somebody else is how a period gets recorded
   * for a person who has not logged in yet.
   */
  private assertMayManage(
    personId: string,
    actor: { personId: string; isAdmin: boolean },
  ): void {
    if (personId !== actor.personId && !actor.isAdmin) {
      throw new ForbiddenException(
        'Only admins can manage absences for other people',
      );
    }
  }

  private async assertPersonBelongsToHauskreis(
    hauskreisId: string,
    personId: string,
  ): Promise<void> {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, hauskreisId },
      select: { id: true },
    });

    if (!person) {
      throw new NotFoundException(`Person ${personId} not found`);
    }
  }
}

/**
 * The two facts every write needs about the caller.
 *
 * Kommt jetzt aus der Mitgliedschaft statt aus einer Realm-Rolle: „Admin" gilt
 * pro Hauskreis, nicht überall.
 */
export function actorFrom(membership: HauskreisMembership): {
  personId: string;
  isAdmin: boolean;
} {
  return {
    personId: membership.id,
    isAdmin: membership.role === PersonRole.ADMIN,
  };
}
