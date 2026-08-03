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

/**
 * Welcher Ausschnitt der Runden.
 *
 * Seit fünf Runden im Voraus stehen, ist „alle" für einen Bildschirm selten
 * die richtige Antwort: wer nachschaut, will entweder wissen, was kommt, oder
 * nachlesen, was war. Die Grenze ist das Ende des Zeitraums — die **laufende**
 * Runde zählt zu `upcoming`, denn sie ist nicht vorbei.
 */
export const listPrayerBuddiesQuerySchema = paginationSchema.extend({
  scope: z.enum(['past', 'upcoming', 'all']).default('all'),
});

export class UpdateCycleConfigDto extends createZodDto(
  updateCycleConfigSchema,
) {}
export class RotateDto extends createZodDto(rotateSchema) {}
export class ListPrayerBuddiesQueryDto extends createZodDto(
  listPrayerBuddiesQuerySchema,
) {}
