'use client';

import { STALE } from '../cache';
import { topicsApi } from '../endpoints';
import type { TopicListParams } from '../params';
import type {
  CreateTopicInput,
  CreateTopicSessionInput,
  NameTopicInput,
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

/**
 * Ein Thema anlegen, ohne dass ein Abend dafür feststeht.
 *
 * Nur `topics.all`: ein Thema ohne Einheiten steht an keinem Termin und ändert
 * dort nichts. Die Einheiten kommen einzeln dazu, und *die* fassen auch die
 * Termine an.
 */
export function useCreateTopic() {
  const { hauskreisId, keys } = useHk();

  return useApiMutation(
    (input: CreateTopicInput) => topicsApi.createTopic(hauskreisId, input),
    { invalidateKeys: [keys.topics.all, keys.archive] },
  );
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

/**
 * Nur der Owner. Wer hier dazukommt, darf **jede** Einheit des Themas ändern
 * und neue anlegen — mehr als die Crew einer einzelnen Einheit.
 */
export function useAddCollaborator(topicId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (personId: string) =>
      topicsApi.addCollaborator(hauskreisId, topicId, personId),
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

/**
 * Eine **einzelne** Einheit anlegen — ohne Thema und ohne Abend.
 *
 * Dieselben Schlüssel wie beim Anlegen unter einem Thema: Sie steht ab sofort
 * in der Archivliste *und* unter den Dingen, die sich an einem Abend wählen
 * lassen.
 */
export function useCreateStandaloneSession() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (input: CreateTopicSessionInput) =>
      topicsApi.createStandaloneSession(hauskreisId, input),
    { invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived] },
  );
}

/**
 * Das Überthema: aus einer einzelnen Einheit wird ein Thema.
 *
 * Räumt auch den Einzelstand der Einheit ab — auf ihrem Bildschirm steht danach
 * die Kopfzeile mit dem Weg zum Thema, und die kommt aus derselben Antwort.
 */
export function useNameTopic(sessionId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (input: NameTopicInput) =>
      topicsApi.nameTopic(hauskreisId, sessionId, input),
    {
      invalidateKeys: [
        keys.topics.all,
        keys.topics.session(sessionId),
        keys.meetings.all,
        ...derived,
      ],
    },
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
 * Wer diese Einheit vorbereitet — ersetzt die Liste.
 *
 * Auch `meetings.all` wird ungültig, und das ist der Punkt der Kopplung: Wer
 * dazukommt, steht danach auch in der Rolle „Thema" des zugeordneten Abends.
 */
export function useSetSessionResponsibles(sessionId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (personIds: string[]) =>
      topicsApi.setSessionResponsibles(hauskreisId, sessionId, personIds),
    {
      invalidateKeys: [
        keys.topics.all,
        keys.topics.session(sessionId),
        keys.meetings.all,
        ...derived,
      ],
    },
  );
}

/*
 * Hier stand `useEditTopicSession` — der Weg vom Termin aus, der sich den ETag
 * beim Schreiben holte, weil die Einheit dort im Termin-DTO steckt und nicht
 * als eigene Ressource im Cache liegt. Seit die Einheit auf ihrer eigenen Seite
 * bearbeitet wird, gibt es diesen Weg nicht mehr: Wer schreibt, hat sie geladen
 * und damit ihren ETag. Ein zweiter Weg wäre eine zweite Meinung darüber, was
 * bei einem Konflikt passiert — `useResourceUpdate` zeigt ihn an, die
 * Kurzfassung verschluckte ihn.
 */

/** Nur Admin. */
export function useRunTopicReminders() {
  const { hauskreisId } = useHk();
  return useApiMutation(() => topicsApi.runTopicReminders(hauskreisId));
}
