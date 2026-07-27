import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingStatus } from '../../generated/prisma/enums';
import { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import { LocationSuggestionService } from '../role-suggestion/location-suggestion.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import type { IfMatchCondition } from '../common/http/etag';
import { toUtcDate } from './meeting-schedule';
import type {
  CreateMeetingDto,
  ListMeetingsQueryDto,
  SetAttendanceDto,
  UpdateMeetingDto,
} from './dto/meeting.dto';

const meetingInclude = {
  location: true,
  host: { select: { id: true, name: true } },
  attendances: {
    select: { personId: true, status: true },
  },
} as const;

@Injectable()
export class MeetingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleSuggestions: RoleSuggestionService,
    private readonly locationSuggestions: LocationSuggestionService,
  ) {}

  findAll(hauskreisId: string, query: ListMeetingsQueryDto) {
    const today = toUtcDate(new Date());

    const dateFilter =
      query.scope === 'upcoming'
        ? { gte: today }
        : query.scope === 'past'
          ? { lt: today }
          : undefined;

    return this.prisma.meeting.findMany({
      where: { hauskreisId, ...(dateFilter ? { date: dateFilter } : {}) },
      include: meetingInclude,
      // Upcoming reads best oldest-first, the archive newest-first.
      orderBy: { date: query.scope === 'past' ? 'desc' : 'asc' },
      take: query.take,
      skip: query.skip,
    });
  }

  async findOne(hauskreisId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, hauskreisId },
      include: meetingInclude,
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${id} not found`);
    }

    return meeting;
  }

  async create(hauskreisId: string, dto: CreateMeetingDto) {
    const date = new Date(dto.date);
    await this.assertReferencesBelongToHauskreis(hauskreisId, dto);

    const clash = await this.prisma.meeting.findFirst({
      where: { hauskreisId, date },
    });

    if (clash) {
      throw new BadRequestException(
        `A meeting already exists on ${dto.date}. Edit that one instead.`,
      );
    }

    return this.prisma.meeting.create({
      data: {
        hauskreisId,
        date,
        type: dto.type,
        locationId: dto.locationId ?? null,
        hostPersonId: dto.hostPersonId ?? null,
        title: dto.title ?? null,
        infoText: dto.infoText ?? null,
      },
      include: meetingInclude,
    });
  }

  async update(
    hauskreisId: string,
    id: string,
    dto: UpdateMeetingDto,
    condition?: IfMatchCondition,
  ) {
    await this.findOne(hauskreisId, id);
    await this.assertReferencesBelongToHauskreis(hauskreisId, dto);

    return updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.meeting.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            type: dto.type,
            status: dto.status,
            // `undefined` leaves a field alone, `null` clears it — that
            // distinction is what lets a host or location be un-assigned.
            locationId: dto.locationId,
            hostPersonId: dto.hostPersonId,
            title: dto.title,
            testimonyText: dto.testimonyText,
            actionstepText: dto.actionstepText,
            summaryText: dto.summaryText,
            infoText: dto.infoText,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.meeting.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id),
      notFoundMessage: `Meeting ${id} not found`,
    });
  }

  cancel(hauskreisId: string, id: string, condition?: IfMatchCondition) {
    return updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.meeting.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: { status: MeetingStatus.CANCELLED, version: { increment: 1 } },
        }),
      exists: () =>
        this.prisma.meeting.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id),
      notFoundMessage: `Meeting ${id} not found`,
    });
  }

  /**
   * Who could host this meeting, best fit first.
   *
   * The meeting itself is excluded from the history — otherwise re-opening the
   * picker on a meeting that already has a host would push that host down the
   * list because of the very assignment being reconsidered.
   */
  async suggestHosts(hauskreisId: string, id: string) {
    const meeting = await this.findOne(hauskreisId, id);

    return this.roleSuggestions.suggestHosts(hauskreisId, meeting.date, {
      excludeMeetingId: meeting.id,
    });
  }

  async suggestLocations(hauskreisId: string, id: string) {
    const meeting = await this.findOne(hauskreisId, id);

    return this.locationSuggestions.suggestLocations(
      hauskreisId,
      meeting.date,
      {
        excludeMeetingId: meeting.id,
      },
    );
  }

  async remove(hauskreisId: string, id: string) {
    await this.findOne(hauskreisId, id);
    await this.prisma.meeting.delete({ where: { id } });
  }

  async setAttendance(hauskreisId: string, id: string, dto: SetAttendanceDto) {
    await this.findOne(hauskreisId, id);
    await this.assertPersonBelongsToHauskreis(hauskreisId, dto.personId);

    return this.prisma.meetingAttendance.upsert({
      where: { meetingId_personId: { meetingId: id, personId: dto.personId } },
      update: { status: dto.status },
      create: { meetingId: id, personId: dto.personId, status: dto.status },
    });
  }

  /**
   * Guards the multi-tenant boundary: a meeting must never point at a person or
   * location from a different Hauskreis. The foreign keys alone would allow it.
   */
  private async assertReferencesBelongToHauskreis(
    hauskreisId: string,
    dto: { locationId?: string | null; hostPersonId?: string | null },
  ): Promise<void> {
    if (dto.hostPersonId) {
      await this.assertPersonBelongsToHauskreis(hauskreisId, dto.hostPersonId);
    }

    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, hauskreisId },
      });

      if (!location) {
        throw new BadRequestException(
          `Location ${dto.locationId} does not belong to this Hauskreis`,
        );
      }
    }
  }

  private async assertPersonBelongsToHauskreis(
    hauskreisId: string,
    personId: string,
  ): Promise<void> {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, hauskreisId },
    });

    if (!person) {
      throw new BadRequestException(
        `Person ${personId} does not belong to this Hauskreis`,
      );
    }
  }
}
