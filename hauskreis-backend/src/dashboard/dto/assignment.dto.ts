import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isoDay } from '../../common/dto/iso-day';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A year is the widest window that still answers a real question ("was war
 * 2026 los"). Without a cap the endpoint would happily walk the whole history
 * of the group, and the response has no pagination to fall back on.
 */
export const MAX_RANGE_DAYS = 366;

export const listAssignmentsQuerySchema = z
  .object({
    /// Both required and both inclusive — an open-ended range is what the cap
    /// exists to prevent.
    from: isoDay,
    to: isoDay,
    /// Omit it for the multi-week table (everyone), pass it for one person's
    /// badges on the home screen.
    personId: z.uuid().optional(),
  })
  .refine((value) => value.to >= value.from, {
    message: 'to must not be before from',
    path: ['to'],
  })
  .refine(
    (value) =>
      (value.to.getTime() - value.from.getTime()) / MS_PER_DAY <=
      MAX_RANGE_DAYS,
    {
      message: `The range must not exceed ${MAX_RANGE_DAYS} days`,
      path: ['to'],
    },
  );

export class ListAssignmentsQueryDto extends createZodDto(
  listAssignmentsQuerySchema,
) {}
