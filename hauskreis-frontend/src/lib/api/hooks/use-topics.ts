'use client';

import { STALE } from '../cache';
import { topicsApi } from '../endpoints';
import type { TopicListParams } from '../params';
import type {
  CreateTopicSessionInput,
  Topic,
  TopicSession,
  UpdateTopicInput,
  UpdateTopicSessionInput,
} from '../types';
import { useHk } from './use-hk';
import { useInfiniteList } from './use-paginated';
import { useApiMutation, useResource, useResourceUpdate } from './use-resource';

/**
 * Die Archivliste. `scope=public` (Vorgabe) zeigt Themen, von denen mindestens
 * ein Abend war; `scope=mine` die eigenen, auch die noch nicht gehaltenen.
 */
export function useTopicList(params: TopicListParams = {}) {
  const { hauskreisId, enabled, keys } = useHk();

  return useInfiniteList({
    queryKey: keys.topics.list(params),
    fetchPage: ({ skip, take, signal }) =>
      topicsApi.listTopics(hauskreisId, { ...params, skip, take }, signal),
    enabled,
    staleTime: STALE.archive,
  });
}

export function useTopic(topicId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useResource<Topic>(
    keys.topics.detail(topicId ?? ''),
    ({ previous, signal }) =>
      topicsApi.getTopic(hauskreisId, topicId!, { previous, signal }),
    { enabled: enabled && Boolean(topicId), staleTime: STALE.detail },
  );
}

/** Titel, Zusammenfassung und Status — alles drei am Thema, nicht am Abend. */
export function useUpdateTopic(topicId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useResourceUpdate<Topic, UpdateTopicInput>({
    queryKey: keys.topics.detail(topicId),
    update: (input, etag) =>
      topicsApi.updateTopic(hauskreisId, topicId, input, etag),
    invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived],
  });
}

/**
 * Ein Thema ändern, ohne seinen Einzelstand im Cache zu haben.
 *
 * Liest ihn **selbst**, statt ihn wie `useUpdateTopic` dort zu erwarten: das
 * Archiv zeigt alle Themen nebeneinander, und für jedes vorsorglich einen
 * Detail-Stand samt ETag zu holen wäre teurer als einer, wenn wirklich jemand
 * etwas ändert. Dasselbe Muster wie `useSetHostWeight`.
 */
export function useEditTopicInList() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    async ({
      topicId,
      input,
    }: {
      topicId: string;
      input: UpdateTopicInput;
    }) => {
      const current = await topicsApi.getTopic(hauskreisId, topicId);

      return topicsApi.updateTopic(hauskreisId, topicId, input, current.etag);
    },
    { invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived] },
  );
}

/**
 * Nur der Owner (und Admins). Löscht das Thema samt aller Einheiten.
 *
 * Ein kommender Abend verliert dadurch seine Auswahl und steht wieder bei
 * „zugeteilt, aber noch nichts gewählt" — die Zuteilung selbst bleibt.
 */
export function useDeleteTopic() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (topicId: string) => topicsApi.deleteTopic(hauskreisId, topicId),
    { invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived] },
  );
}

/** Nur der Owner. Was die Person gehalten hat, bleibt an den Einheiten stehen. */
export function useRemoveCollaborator(topicId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (personId: string) =>
      topicsApi.removeCollaborator(hauskreisId, topicId, personId),
    {
      invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived],
    },
  );
}

/**
 * Eine Einheit anlegen, ohne dass ein Abend dafür feststeht.
 *
 * Auch `meetings.all` wird ungültig: die neue Einheit steht ab sofort unter
 * „Angefangenes", und das ist eine Auswahl, die an jedem Termin hängt.
 */
export function useCreateTopicSession(topicId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (input: CreateTopicSessionInput) =>
      topicsApi.createTopicSession(hauskreisId, topicId, input),
    { invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived] },
  );
}

/** Nur, solange die Einheit noch nicht gehalten wurde. */
export function useDeleteTopicSession() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (sessionId: string) => topicsApi.deleteTopicSession(hauskreisId, sessionId),
    { invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived] },
  );
}

export function useTopicSession(sessionId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useResource<TopicSession>(
    keys.topics.session(sessionId ?? ''),
    ({ previous, signal }) =>
      topicsApi.getTopicSession(hauskreisId, sessionId!, { previous, signal }),
    { enabled: enabled && Boolean(sessionId), staleTime: STALE.detail },
  );
}

/** Titel, Actionstep und Zusammenfassung eines einzelnen Abends. */
export function useUpdateTopicSession(sessionId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useResourceUpdate<TopicSession, UpdateTopicSessionInput>({
    queryKey: keys.topics.session(sessionId),
    update: (input, etag) =>
      topicsApi.updateTopicSession(hauskreisId, sessionId, input, etag),
    invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived],
  });
}

/**
 * Eine Einheit ändern, ohne ihren Einzelstand im Cache zu haben.
 *
 * Der Weg vom Termin aus: dort steht die Einheit im Termin-DTO, nicht als
 * eigene Ressource, und ihr ETag liegt damit nirgends. Wie bei
 * `useEditTopicInList` wird er beim Schreiben geholt.
 */
export function useEditTopicSession() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    async ({
      sessionId,
      input,
    }: {
      sessionId: string;
      input: UpdateTopicSessionInput;
    }) => {
      const current = await topicsApi.getTopicSession(hauskreisId, sessionId);

      return topicsApi.updateTopicSession(
        hauskreisId,
        sessionId,
        input,
        current.etag,
      );
    },
    { invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived] },
  );
}

/** Nur Admin. */
export function useRunTopicReminders() {
  const { hauskreisId } = useHk();
  return useApiMutation(() => topicsApi.runTopicReminders(hauskreisId));
}
