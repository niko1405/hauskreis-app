import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  isoDateTimeOut,
  pageSchema,
  personRefSchema,
} from '../../common/dto/response';

/**
 * Ein Zeitraum, in dem jemand nicht da ist.
 *
 * Der Zeitraum ist die Wahrheit; die einzelnen Absagen an den Terminen werden
 * daraus abgeleitet und laufen nach. Wer für einen einzelnen Abend doch zusagt,
 * überschreibt die Ableitung — eine bewusste Antwort sticht den Datumsbereich.
 *
 * Wirkt sich **nicht** auf die Gebetsbuddys aus: die laufen unabhängig weiter.
 */
export const absenceResponseSchema = z.object({
  id: z.uuid(),
  hauskreisId: z.uuid(),
  personId: z.uuid(),
  /// `@db.Date`-Spalten, aber Prisma liefert volle Zeitstempel — für die
  /// Anzeige nur den Datumsteil nehmen.
  startDate: isoDateTimeOut,
  /// Einschließlich: „bis 24." deckt den 24. mit ab. Eine eintägige
  /// Abwesenheit trägt auf beiden Seiten dasselbe Datum.
  endDate: isoDateTimeOut,
  reason: z.string().nullable(),
  createdAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
  person: personRefSchema,
});

/** Was der Abgleich an abgeleiteten Absagen geändert hat. */
export const syncResultSchema = z.object({
  /// Abende, die stellvertretend neu auf „kommt nicht" gesetzt wurden.
  declined: z.number().int().nonnegative(),
  /// Abgeleitete Absagen, die zurückgenommen wurden, weil kein Zeitraum sie
  /// mehr abdeckt.
  withdrawn: z.number().int().nonnegative(),
});

export class AbsenceResponseDto extends createZodDto(absenceResponseSchema) {}
export class AbsencePageResponseDto extends createZodDto(
  pageSchema(absenceResponseSchema),
) {}
export class SyncResultResponseDto extends createZodDto(syncResultSchema) {}
