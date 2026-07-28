import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TopicService } from './topic.service';
import { MeetingStatus, MeetingType } from '../../generated/prisma/enums';
import { toUtcDate } from '../meeting/meeting-schedule';

export interface CarryOverResult {
  /** Meetings that were given the running topic. */
  filled: number;
}

/**
 * Keeps a running topic on the next meeting, so nobody has to re-assign it
 * every week (CLAUDE.md §5).
 *
 * Only the **next** standard meeting is prefilled, not the whole planning
 * window: a topic rarely runs seven weeks, and filling them all in advance
 * would state something the group has not decided. Once that evening is over
 * and the topic is still RUNNING, the following run picks up the one after.
 *
 * Runs a quarter of an hour after the meeting generator, so freshly created
 * evenings are covered on the same night. It is idempotent, so an extra run
 * costs nothing.
 */
@Injectable()
export class TopicCarryOverService {
  private readonly logger = new Logger(TopicCarryOverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly topics: TopicService,
  ) {}

  @Cron('15 3 * * *', { name: 'carry-over-topics' })
  async handleCron(): Promise<void> {
    const hauskreise = await this.prisma.hauskreis.findMany({
      select: { id: true },
    });

    const results = await Promise.all(
      hauskreise.map((hauskreis) => this.carryOverFor(hauskreis.id)),
    );

    const filled = results.reduce((total, result) => total + result.filled, 0);

    if (filled > 0) {
      this.logger.log(`Prefilled ${filled} meeting(s) with a running topic`);
    }
  }

  async carryOverFor(
    hauskreisId: string,
    now = new Date(),
  ): Promise<CarryOverResult> {
    const topicId = await this.topics.findCarryOverTopic(hauskreisId);

    if (!topicId) {
      return { filled: 0 };
    }

    // Only STANDARD evenings carry a topic: LOBPREIS_GEBET has a testimony
    // instead, and CUSTOM is whatever the group made it.
    //
    // Deliberately *not* filtered on `topicId: null`. Looking for the next
    // topic-less meeting would fill one more evening on every nightly run, and
    // a week later the whole planning window would be claimed by a topic that
    // rarely runs longer than two or three evenings. Asking for the earliest
    // upcoming meeting and stopping when it already has one makes the job
    // genuinely idempotent: it only ever prepares the next evening.
    const next = await this.prisma.meeting.findFirst({
      where: {
        hauskreisId,
        date: { gte: toUtcDate(now) },
        type: MeetingType.STANDARD,
        status: MeetingStatus.PLANNED,
      },
      orderBy: { date: 'asc' },
      select: { id: true, topicId: true },
    });

    if (!next || next.topicId !== null) {
      return { filled: 0 };
    }

    // Guarded on `topicId: null` so a topic somebody set by hand in the
    // meantime is never overwritten.
    const { count } = await this.prisma.meeting.updateMany({
      where: { id: next.id, topicId: null },
      data: { topicId, version: { increment: 1 } },
    });

    return { filled: count };
  }
}
