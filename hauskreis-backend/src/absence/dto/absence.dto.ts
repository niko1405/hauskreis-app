import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { paginationSchema } from '../../common/http/pagination';
import { isoDay } from '../../common/dto/iso-day';

/** Date-only, as the group thinks about it: "vom 10. bis 24.". */
const dateOnly = isoDay;

const range = {
  startDate: dateOnly,
  /// Inclusive. A one-day absence repeats the same date.
  endDate: dateOnly,
};

const endNotBeforeStart = <T extends { startDate: Date; endDate: Date }>(
  value: T,
) => value.endDate >= value.startDate;

const endNotBeforeStartMessage = {
  message: 'endDate must not be before startDate',
  path: ['endDate'],
};

export const createAbsenceSchema = z
  .object({
    /// Optional: normally you enter your own absence. Admins may enter one for
    /// somebody else, which is what makes it possible to note a holiday for a
    /// person who has not logged in yet.
    personId: z.uuid().optional(),
    ...range,
    reason: z.string().trim().max(200).nullish(),
  })
  .refine(endNotBeforeStart, endNotBeforeStartMessage);

export const updateAbsenceSchema = z
  .object({
    ...range,
    reason: z.string().trim().max(200).nullish(),
  })
  .refine(endNotBeforeStart, endNotBeforeStartMessage);

export const listAbsencesQuerySchema = paginationSchema.extend({
  personId: z.uuid().optional(),
  /// `upcoming` hides periods that are entirely over — the default, because
  /// planning only ever cares about those. `all` is the archive view.
  scope: z.enum(['upcoming', 'all']).default('upcoming'),
});

export const absenceParamsSchema = z.object({
  hauskreisId: z.uuid(),
  id: z.uuid(),
});

export class CreateAbsenceDto extends createZodDto(createAbsenceSchema) {}
export class UpdateAbsenceDto extends createZodDto(updateAbsenceSchema) {}
export class ListAbsencesQueryDto extends createZodDto(
  listAbsencesQuerySchema,
) {}
export class AbsenceParamsDto extends createZodDto(absenceParamsSchema) {}
