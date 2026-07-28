import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TopicStatus } from '../../../generated/prisma/enums';
import { paginationSchema } from '../../common/http/pagination';

const topicStatus = z.enum(TopicStatus);

/**
 * The title is optional on purpose — CLAUDE.md §5: nicht jeder trägt vorab
 * einen Titel ein. A topic with only a responsible person is a valid state.
 */
export const createTopicSchema = z.object({
  title: z.string().trim().min(1).max(200).nullish(),
  /// One or two people prepare a topic; the schema allows more rather than
  /// hard-coding a limit the group might outgrow.
  responsiblePersonIds: z.array(z.uuid()).max(5).default([]),
});

export const updateTopicSchema = z.object({
  title: z.string().trim().min(1).max(200).nullish(),
  status: topicStatus.optional(),
  /// Omitted leaves the current people alone; an array replaces them wholesale,
  /// which is what a "wer bereitet vor" picker sends back.
  responsiblePersonIds: z.array(z.uuid()).max(5).optional(),
});

export const listTopicsQuerySchema = paginationSchema.extend({
  status: topicStatus.optional(),
});

const topicParamsSchema = z.object({
  hauskreisId: z.uuid(),
  id: z.uuid(),
});

export class CreateTopicDto extends createZodDto(createTopicSchema) {}
export class UpdateTopicDto extends createZodDto(updateTopicSchema) {}
export class ListTopicsQueryDto extends createZodDto(listTopicsQuerySchema) {}
export class TopicParamsDto extends createZodDto(topicParamsSchema) {}
