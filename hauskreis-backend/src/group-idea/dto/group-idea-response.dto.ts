import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isoDateTimeOut, personRefSchema } from '../../common/dto/response';

/**
 * Eine Idee der Gruppe.
 *
 * `doneAt` und nicht `done`: Die erledigten stehen nach Zeitpunkt sortiert
 * untereinander, und ein `Boolean` wüsste die Reihenfolge nicht. Die Oberfläche
 * liest daraus beides — den Haken aus „ist gesetzt", die Sortierung aus dem
 * Wert.
 *
 * `createdBy` darf fehlen: Konto löschen heißt anonymisieren, und eine Idee
 * ohne Urheber ist immer noch eine Idee.
 */
export const groupIdeaResponseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  note: z.string().nullable(),
  doneAt: isoDateTimeOut.nullable(),
  doneBy: personRefSchema.nullable(),
  createdBy: personRefSchema.nullable(),
  createdAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
});

export class GroupIdeaResponseDto extends createZodDto(
  groupIdeaResponseSchema,
) {}
export class GroupIdeaListResponseDto extends createZodDto(
  z.array(groupIdeaResponseSchema),
) {}
