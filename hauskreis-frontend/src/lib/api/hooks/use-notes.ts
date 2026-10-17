'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toggleCheck } from '@/lib/notes/markdown';
import { STALE } from '../cache';
import type { Resource } from '../client';
import { notesApi } from '../endpoints';
import type { NoteListParams } from '../params';
import type {
  CheckNoteInput,
  CreateNoteInput,
  Note,
  SetNotePeopleInput,
  UpdateNoteInput,
} from '../types';
import { useHk } from './use-hk';
import { useInfiniteList } from './use-paginated';
import { useApiMutation, useResource, useResourceUpdate } from './use-resource';

/** Die Notizen, die man sehen darf — zuletzt geänderte zuerst. */
export function useNoteList(params: NoteListParams = {}) {
  const { hauskreisId, enabled, keys } = useHk();

  return useInfiniteList({
    queryKey: keys.notes.list(params),
    fetchPage: ({ skip, take, signal }) =>
      notesApi.listNotes(hauskreisId, { ...params, skip, take }, signal),
    enabled,
    staleTime: STALE.list,
  });
}

export function useNote(noteId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useResource<Note>(
    keys.notes.detail(noteId ?? ''),
    ({ previous, signal }) =>
      notesApi.getNote(hauskreisId, noteId!, { previous, signal }),
    { enabled: enabled && Boolean(noteId), staleTime: STALE.detail },
  );
}

/** Die Kachel im Archiv zählt mit — deshalb auch `archive`. */
export function useCreateNote() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: CreateNoteInput) => notesApi.createNote(hauskreisId, input),
    { invalidateKeys: [keys.notes.all, keys.archive] },
  );
}

/** Titel und Text. Ein fremder Stand dazwischen meldet sich als `conflict`. */
export function useUpdateNote(noteId: string) {
  const { hauskreisId, keys } = useHk();

  return useResourceUpdate<Note, UpdateNoteInput>({
    queryKey: keys.notes.detail(noteId),
    update: (input, etag) =>
      notesApi.updateNote(hauskreisId, noteId, input, etag),
    invalidateKeys: [keys.notes.lists],
  });
}

/** Wer mitschreibt — und „Ganze Gruppe". Die Antwort ist gleich der neue Stand. */
export function useSetNotePeople(noteId: string) {
  const { hauskreisId, keys } = useHk();
  const queryClient = useQueryClient();

  return useApiMutation(
    (input: SetNotePeopleInput) =>
      notesApi.setNotePeople(hauskreisId, noteId, input),
    {
      invalidateKeys: [keys.notes.lists, keys.archive],
      onSuccess: (resource: Resource<Note>) => {
        queryClient.setQueryData(keys.notes.detail(noteId), resource);
      },
    },
  );
}

/**
 * Einen Checklistenpunkt abhaken — der Haken steht sofort da.
 *
 * Vorgegriffen wird im Einzelstand: Ein Haken, der erst nach der Antwort
 * erscheint, fühlt sich auf einer Packliste an wie ein Knopf, der nicht geht.
 * Geht es schief (409, der Punkt hat sich geändert), nimmt `useApiMutation`
 * ihn zurück und meldet sich; der frische Stand kommt hinterher.
 */
export function useCheckNote(noteId: string) {
  const { hauskreisId, keys } = useHk();
  const queryClient = useQueryClient();
  const detail = keys.notes.detail(noteId);

  return useApiMutation(
    (input: CheckNoteInput) => notesApi.checkNote(hauskreisId, noteId, input),
    {
      optimistic: async (input, patch) => {
        await patch<Resource<Note>>(detail, (previous) => {
          const body = toggleCheck(
            previous.data.body,
            input.index,
            input.text,
            input.done,
          );
          return body === null
            ? previous
            : { ...previous, data: { ...previous.data, body } };
        });
      },
      invalidateKeys: [keys.notes.lists],
      onSuccess: (resource: Resource<Note>) => {
        queryClient.setQueryData(detail, resource);
      },
      onError: () => {
        void queryClient.invalidateQueries({ queryKey: detail });
      },
    },
  );
}

export function useDeleteNote() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (noteId: string) => notesApi.deleteNote(hauskreisId, noteId),
    { invalidateKeys: [keys.notes.all, keys.archive] },
  );
}
