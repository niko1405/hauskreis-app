import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  isoDateTimeOut,
  pageSchema,
  personRefSchema,
} from '../../common/dto/response';

/**
 * Eine Notiz, so wie sie auf ihrer Seite steht.
 *
 * `createdBy` und `updatedBy` dürfen fehlen: Konto löschen heißt
 * anonymisieren. `members` sind die Eingetragenen **ohne** den, der sie
 * angelegt hat — bei `forEveryone` zählt die Liste nicht, sie bleibt aber
 * stehen, damit Zurückschalten wieder dieselben Leute hat.
 *
 * `mayManage` rechnet der Server: Wer die Leute ändern und löschen darf, hängt
 * am Notausgang (`mayManageNote`), und den soll die Oberfläche nicht
 * nachbauen.
 */
export const noteResponseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  forEveryone: z.boolean(),
  createdBy: personRefSchema.nullable(),
  updatedBy: personRefSchema.nullable(),
  members: z.array(z.object({ person: personRefSchema })),
  createdAt: isoDateTimeOut,
  updatedAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
  mayManage: z.boolean(),
});

/**
 * Eine Notiz in der Liste — ohne den Text, mit einer Zeile Vorschau und dem
 * Stand der Checklisten. Eine lange Packliste in voller Länge zwanzigmal
 * mitzuschicken, damit die Liste daraus eine Zeile macht, wäre Verschwendung.
 */
export const noteListItemSchema = noteResponseSchema
  .omit({ body: true })
  .extend({
    preview: z.string(),
    checklist: z.object({
      done: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
  });

export class NoteResponseDto extends createZodDto(noteResponseSchema) {}
export class NotePageResponseDto extends createZodDto(
  pageSchema(noteListItemSchema),
) {}
