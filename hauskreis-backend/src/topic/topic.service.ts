import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TopicStatus } from '../../generated/prisma/enums';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import type { IfMatchCondition } from '../common/http/etag';
import type {
  CreateTopicDto,
  ListTopicsQueryDto,
  UpdateTopicDto,
} from './dto/topic.dto';

const topicInclude = {
  responsibles: {
    select: { person: { select: { id: true, name: true } } },
  },
  meetings: {
    select: { id: true, date: true },
    orderBy: { date: 'asc' },
  },
} as const;

@Injectable()
export class TopicService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(hauskreisId: string, query: ListTopicsQueryDto) {
    return this.prisma.topic.findMany({
      where: { hauskreisId, ...(query.status ? { status: query.status } : {}) },
      include: topicInclude,
      // Newest first: the archive and the "was läuft gerade" view both read
      // that way round.
      orderBy: { createdAt: 'desc' },
      take: query.take,
      skip: query.skip,
    });
  }

  async findOne(hauskreisId: string, id: string) {
    const topic = await this.prisma.topic.findFirst({
      where: { id, hauskreisId },
      include: topicInclude,
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${id} not found`);
    }

    return topic;
  }

  async create(hauskreisId: string, dto: CreateTopicDto) {
    await this.assertPeopleBelongToHauskreis(
      hauskreisId,
      dto.responsiblePersonIds,
    );

    return this.prisma.topic.create({
      data: {
        hauskreisId,
        title: dto.title ?? null,
        responsibles: {
          create: dto.responsiblePersonIds.map((personId) => ({ personId })),
        },
      },
      include: topicInclude,
    });
  }

  async update(
    hauskreisId: string,
    id: string,
    dto: UpdateTopicDto,
    condition?: IfMatchCondition,
  ) {
    await this.findOne(hauskreisId, id);

    if (dto.responsiblePersonIds) {
      await this.assertPeopleBelongToHauskreis(
        hauskreisId,
        dto.responsiblePersonIds,
      );
    }

    return updateWithVersionCheck({
      condition,
      update: async (versionConstraint) => {
        const result = await this.prisma.topic.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            title: dto.title,
            status: dto.status,
            version: { increment: 1 },
          },
        });

        // Only touch the join rows once the version check has passed, so a
        // stale write leaves the responsible people as they were.
        if (result.count > 0 && dto.responsiblePersonIds) {
          await this.replaceResponsibles(id, dto.responsiblePersonIds);
        }

        return result;
      },
      exists: () => this.prisma.topic.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id),
      notFoundMessage: `Topic ${id} not found`,
    });
  }

  async remove(hauskreisId: string, id: string) {
    await this.findOne(hauskreisId, id);
    // Meetings keep their row; `topic_id` is set to null by the foreign key.
    await this.prisma.topic.delete({ where: { id } });
  }

  /**
   * The topic a newly generated meeting should start with.
   *
   * CLAUDE.md §5: solange ein Thema läuft, wird der nächste Termin damit
   * vorbelegt. Where several are running, the one used most recently wins —
   * that is the thread the group is actually on.
   */
  async findCarryOverTopic(hauskreisId: string) {
    const lastUse = await this.prisma.meeting.findFirst({
      where: {
        hauskreisId,
        topicId: { not: null },
        topic: { status: TopicStatus.RUNNING },
      },
      orderBy: { date: 'desc' },
      select: { topicId: true },
    });

    if (lastUse?.topicId) {
      return lastUse.topicId;
    }

    // A running topic that has never been on a meeting yet — someone planned
    // ahead. Picking it up is better than leaving the evening empty.
    const unused = await this.prisma.topic.findFirst({
      where: { hauskreisId, status: TopicStatus.RUNNING },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    return unused?.id ?? null;
  }

  private async replaceResponsibles(
    topicId: string,
    personIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.topicResponsible.deleteMany({
        where: { topicId, personId: { notIn: personIds } },
      }),
      this.prisma.topicResponsible.createMany({
        data: personIds.map((personId) => ({ topicId, personId })),
        skipDuplicates: true,
      }),
    ]);
  }

  /**
   * Guards the multi-tenant boundary: the foreign keys alone would let a topic
   * point at people from another Hauskreis.
   */
  private async assertPeopleBelongToHauskreis(
    hauskreisId: string,
    personIds: string[],
  ): Promise<void> {
    if (personIds.length === 0) {
      return;
    }

    const found = await this.prisma.person.count({
      where: { id: { in: personIds }, hauskreisId },
    });

    if (found !== new Set(personIds).size) {
      throw new BadRequestException(
        'At least one responsible person does not belong to this Hauskreis',
      );
    }
  }
}
