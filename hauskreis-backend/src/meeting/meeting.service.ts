import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceSource,
  AttendanceStatus,
  MeetingStatus,
} from '../../generated/prisma/enums';
import { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import { MeetingNotificationService } from './meeting-notification.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import { toPage } from '../common/http/pagination';
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
  topic: {
    select: {
      id: true,
      title: true,
      status: true,
      responsibles: {
        select: { person: { select: { id: true, name: true } } },
      },
    },
  },
  attendances: {
    select: { personId: true, status: true },
  },
} as const;

@Injectable()
export class MeetingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleSuggestions: RoleSuggestionService,
    private readonly meetingNotifications: MeetingNotificationService,
  ) {}

  async findAll(hauskreisId: string, query: ListMeetingsQueryDto) {
    const today = toUtcDate(new Date());

    // `from`/`to` narrow the scope rather than replace it: `scope=past` with a
    // `to` next year must still stop at today, or the archive would quietly
    // start listing evenings that have not happened.
    const date: { gte?: Date; lt?: Date; lte?: Date } = {};

    if (query.scope === 'upcoming') {
      date.gte = today;
    } else if (query.scope === 'past') {
      date.lt = today;
    }

    if (query.from) {
      const from = toUtcDate(query.from);
      date.gte = date.gte && date.gte > from ? date.gte : from;
    }

    if (query.to) {
      date.lte = toUtcDate(query.to);
    }

    const where = {
      hauskreisId,
      ...(Object.keys(date).length > 0 ? { date } : {}),
      ...buildMeetingSearch(query.search),
    };

    const [items, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        include: meetingInclude,
        // Upcoming reads best oldest-first, the archive newest-first.
        orderBy: { date: query.scope === 'past' ? 'desc' : 'asc' },
        take: query.take,
        skip: query.skip,
      }),
      this.prisma.meeting.count({ where }),
    ]);

    return toPage(items, total, query);
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
        topicId: dto.topicId ?? null,
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
    const before = await this.findOne(hauskreisId, id);
    await this.assertReferencesBelongToHauskreis(hauskreisId, dto);

    const updated = await updateWithVersionCheck({
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
            topicId: dto.topicId,
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

    // A meeting can also be called off through a plain status change, so the
    // announcement hangs off the transition rather than off `cancel()` — the
    // two paths would otherwise behave differently for no reason.
    if (
      before.status !== MeetingStatus.CANCELLED &&
      updated.status === MeetingStatus.CANCELLED
    ) {
      await this.meetingNotifications.announceCancellation(id);
    }

    return updated;
  }

  async cancel(hauskreisId: string, id: string, condition?: IfMatchCondition) {
    const before = await this.findOne(hauskreisId, id);

    const cancelled = await updateWithVersionCheck({
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

    // Cancelling an already-cancelled meeting stays silent.
    if (before.status !== MeetingStatus.CANCELLED) {
      await this.meetingNotifications.announceCancellation(id);
    }

    return cancelled;
  }

  /**
   * Who could host this meeting, and where, best fit first.
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

  /**
   * Who could prepare the topic for this meeting, best fit first.
   *
   * A topic already on the meeting is left out of the history, so re-opening
   * the picker does not push its own people down the list.
   */
  async suggestTopicResponsibles(hauskreisId: string, id: string) {
    const meeting = await this.findOne(hauskreisId, id);

    return this.roleSuggestions.suggestTopicResponsibles(
      hauskreisId,
      meeting.date,
      { excludeTopicId: meeting.topicId ?? undefined },
    );
  }

  async remove(hauskreisId: string, id: string) {
    await this.findOne(hauskreisId, id);
    await this.prisma.meeting.delete({ where: { id } });
  }

  async setAttendance(hauskreisId: string, id: string, dto: SetAttendanceDto) {
    await this.findOne(hauskreisId, id);
    await this.assertPersonBelongsToHauskreis(hauskreisId, dto.personId);

    const previous = await this.prisma.meetingAttendance.findUnique({
      where: { meetingId_personId: { meetingId: id, personId: dto.personId } },
      select: { status: true },
    });

    const attendance = await this.prisma.meetingAttendance.upsert({
      where: { meetingId_personId: { meetingId: id, personId: dto.personId } },
      // Answering by hand claims the row, even when an absence period wrote it.
      // Without this a "doch, ich komme" would keep the ABSENCE marker and the
      // next sync would feel free to delete it again.
      update: { status: dto.status, source: AttendanceSource.SELF },
      create: {
        meetingId: id,
        personId: dto.personId,
        status: dto.status,
        source: AttendanceSource.SELF,
      },
    });

    // Only on the transition into "absent": re-saving the same answer, or
    // switching between attending and undecided, is nobody's business.
    if (
      dto.status === AttendanceStatus.ABSENT &&
      previous?.status !== AttendanceStatus.ABSENT
    ) {
      await this.meetingNotifications.handleDecline(id, dto.personId);
    }

    return attendance;
  }

  /**
   * Guards the multi-tenant boundary: a meeting must never point at a person or
   * location from a different Hauskreis. The foreign keys alone would allow it.
   */
  private async assertReferencesBelongToHauskreis(
    hauskreisId: string,
    dto: {
      locationId?: string | null;
      hostPersonId?: string | null;
      topicId?: string | null;
    },
  ): Promise<void> {
    if (dto.hostPersonId) {
      await this.assertPersonBelongsToHauskreis(hauskreisId, dto.hostPersonId);
    }

    if (dto.topicId) {
      const topic = await this.prisma.topic.findFirst({
        where: { id: dto.topicId, hauskreisId },
      });

      if (!topic) {
        throw new BadRequestException(
          `Topic ${dto.topicId} does not belong to this Hauskreis`,
        );
      }
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

/**
 * Matches free text against everything an evening was written down as.
 *
 * Deliberately spread across all the text fields plus the topic's title: the
 * archive question is "wann ging es nochmal um Vergebung", and nobody
 * remembers whether that ended up in the summary, the info line or the topic.
 *
 * `contains` with `insensitive` rather than full-text search — at a few hundred
 * evenings the index would cost more to maintain than the scan costs to run,
 * and substring matching is what people expect from a search box.
 */
function buildMeetingSearch(search: string | undefined) {
  if (!search) {
    return {};
  }

  const contains = { contains: search, mode: 'insensitive' as const };

  return {
    OR: [
      { title: contains },
      { summaryText: contains },
      { actionstepText: contains },
      { infoText: contains },
      { testimonyText: contains },
      { topic: { title: contains } },
    ],
  };
}
