import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { paginationSchema } from '../../common/http/pagination';

export const updateCycleConfigSchema = z.object({
  /// One to twelve weeks. Below one there is no rhythm left, above twelve the
  /// pairing is no longer a rotation.
  periodLengthWeeks: z.coerce.number().int().min(1).max(12),
});

export const rotateSchema = z.object({
  /// Skips the push notification — useful when re-rolling a grouping twice in
  /// a row and not wanting to buzz everyone each time.
  notify: z.boolean().default(true),
});

export const listPrayerBuddiesQuerySchema = paginationSchema;

export class UpdateCycleConfigDto extends createZodDto(
  updateCycleConfigSchema,
) {}
export class RotateDto extends createZodDto(rotateSchema) {}
export class ListPrayerBuddiesQueryDto extends createZodDto(
  listPrayerBuddiesQuerySchema,
) {}
