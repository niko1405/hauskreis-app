import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TopicStatus } from '../../../generated/prisma/enums';
import {
  isoDateTimeOut,
  pageSchema,
  personRefSchema,
} from '../../common/dto/response';

/**
 * Ein Thema — nicht an einen Termin gebunden.
 *
 * Ein Thema kann sich über mehrere Abende ziehen; solange es `RUNNING` ist,
 * wird der nächste Termin automatisch damit vorbelegt. Deshalb `meetings`: die
 * Abende, an denen es dran war oder drankommt.
 */
export const topicResponseSchema = z.object({
  id: z.uuid(),
  hauskreisId: z.uuid(),
  /// Optional — nicht jeder legt vorab einen Titel fest.
  title: z.string().nullable(),
  /// `RUNNING` läuft von allein auf den nächsten Termin über, `COMPLETED` löst
  /// den Vorschlag für ein neues Thema aus.
  status: z.enum(TopicStatus),
  createdAt: isoDateTimeOut,
  updatedAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
  /// Eine oder zwei Personen bereiten vor.
  responsibles: z.array(z.object({ person: personRefSchema })),
  /// Chronologisch, damit „seit wann läuft das" ablesbar ist.
  /// Zeitstempel, nicht nur der Tag — siehe die Anmerkung am Termin selbst.
  meetings: z.array(z.object({ id: z.uuid(), date: isoDateTimeOut })),
});

/** Wie viele Termine das laufende Thema uebernommen haben. */
export const carryOverResultSchema = z.object({
  filled: z.number().int().nonnegative(),
});

export class TopicResponseDto extends createZodDto(topicResponseSchema) {}
export class CarryOverResultResponseDto extends createZodDto(
  carryOverResultSchema,
) {}
export class TopicPageResponseDto extends createZodDto(
  pageSchema(topicResponseSchema),
) {}
