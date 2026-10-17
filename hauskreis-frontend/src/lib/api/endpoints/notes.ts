/**
 * `…/notes` — Texte, an denen mehrere schreiben, ohne dass sie an einem Abend
 * hängen.
 *
 * Wer eine Notiz sehen darf, schreibt mit; wer sie angelegt hat, entscheidet,
 * wer dabei ist. Was jemand nicht sehen darf, gibt es für ihn nicht — der
 * Server antwortet dann mit 404.
 */
import {
  UNCONDITIONAL,
  apiDelete,
  apiGet,
  apiGetResource,
  apiPatch,
  apiPost,
  apiPostWithPrecondition,
  apiPut,
  type Resource,
} from '../client';
import { hkPath } from './paths';
import type { NoteListParams } from '../params';
import type {
  CheckNoteInput,
  CreateNoteInput,
  Note,
  NoteListItem,
  Page,
  SetNotePeopleInput,
  UpdateNoteInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/notes');

export function listNotes(
  hauskreisId: string,
  params: NoteListParams = {},
  signal?: AbortSignal,
): Promise<Page<NoteListItem>> {
  return apiGet<Page<NoteListItem>>(base(hauskreisId), {
    query: { ...params },
    signal,
  });
}

export function getNote(
  hauskreisId: string,
  noteId: string,
  options: { previous?: Resource<Note>; signal?: AbortSignal } = {},
): Promise<Resource<Note>> {
  return apiGetResource<Note>(`${base(hauskreisId)}/${noteId}`, options);
}

export function createNote(
  hauskreisId: string,
  input: CreateNoteInput,
): Promise<Note> {
  return apiPost<Note>(base(hauskreisId), input);
}

/** Titel und Text — mit `If-Match`, zwei Fassungen übereinander wären eine zu viel. */
export function updateNote(
  hauskreisId: string,
  noteId: string,
  input: UpdateNoteInput,
  etag: string | undefined,
): Promise<Resource<Note>> {
  return apiPatch<Note>(`${base(hauskreisId)}/${noteId}`, input, { etag });
}

/** Wer mitschreibt, als ganze Liste. Nur, wer sie angelegt hat. */
export function setNotePeople(
  hauskreisId: string,
  noteId: string,
  input: SetNotePeopleInput,
): Promise<Resource<Note>> {
  return apiPut<Note>(
    `${base(hauskreisId)}/${noteId}/people`,
    input,
    UNCONDITIONAL,
  );
}

/**
 * Einen Checklistenpunkt abhaken — ohne `If-Match`: Zwei, die gleichzeitig
 * verschiedene Punkte abhaken, sind kein Konflikt. Die Vorbedingung ist der
 * Text des Punkts; stimmt er nicht mehr, antwortet der Server mit 409.
 *
 * Mit Antwort samt ETag, damit der Stand im Cache gleich der neue ist.
 */
export function checkNote(
  hauskreisId: string,
  noteId: string,
  input: CheckNoteInput,
): Promise<Resource<Note>> {
  return apiPostWithPrecondition<Note>(
    `${base(hauskreisId)}/${noteId}/check`,
    UNCONDITIONAL,
    input,
  );
}

export function deleteNote(hauskreisId: string, noteId: string): Promise<void> {
  return apiDelete(`${base(hauskreisId)}/${noteId}`);
}
