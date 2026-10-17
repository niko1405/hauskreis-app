import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { paginationSchema } from '../../common/http/pagination';

const title = z.string().trim().min(1).max(200);
/** Kein `trim`: Leerzeilen am Ende hat vielleicht jemand mit Absicht gesetzt. */
const body = z.string().max(20000);
const personIds = z.array(z.uuid()).max(100);

/**
 * Eine Notiz anlegen.
 *
 * `personIds` ohne den, der anlegt — der ist ohnehin dabei. Mit
 * `forEveryone` ist die Liste egal: Dann schreibt die ganze Gruppe mit.
 */
export const createNoteSchema = z.object({
  title,
  body: body.optional(),
  forEveryone: z.boolean().optional(),
  personIds: personIds.optional(),
});

/** Titel und Text — wer dabei ist, steht unter `…/people`. */
export const updateNoteSchema = z.object({
  title: title.optional(),
  body: body.optional(),
});

/**
 * Wer mitschreibt, als ganze Liste.
 *
 * Ersetzt statt hinzufügen: Das Sheet zeigt einen Entwurf aller Beteiligten,
 * und ein Speichern schreibt ihn — zwei Wege für „dazu" und „weg" wären zwei
 * Gelegenheiten, dass einer davon scheitert und der andere nicht.
 */
export const setNotePeopleSchema = z.object({
  forEveryone: z.boolean(),
  personIds,
});

/**
 * Einen Punkt einer Checkliste abhaken.
 *
 * `index` zählt die Checklistenpunkte, nicht die Zeilen; `text` ist, was dort
 * stehen muss. Ohne `If-Match`: Zwei, die gleichzeitig verschiedene Punkte
 * abhaken, sind kein Konflikt (siehe `toggleCheck`).
 */
export const checkNoteSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string().max(2000),
  done: z.boolean(),
});

export const listNotesQuerySchema = paginationSchema.extend({
  /// Trifft auf Titel und Text.
  search: z.string().trim().min(1).max(200).optional(),
});

const noteParamsSchema = z.object({
  hauskreisId: z.uuid(),
  id: z.uuid(),
});

export class CreateNoteDto extends createZodDto(createNoteSchema) {}
export class UpdateNoteDto extends createZodDto(updateNoteSchema) {}
export class SetNotePeopleDto extends createZodDto(setNotePeopleSchema) {}
export class CheckNoteDto extends createZodDto(checkNoteSchema) {}
export class ListNotesQueryDto extends createZodDto(listNotesQuerySchema) {}
export class NoteParamsDto extends createZodDto(noteParamsSchema) {}
