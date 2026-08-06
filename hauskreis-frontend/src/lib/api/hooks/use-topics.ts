'use client';

import { STALE } from '../cache';
import { topicsApi } from '../endpoints';
import type { TopicListParams } from '../params';
import type { CreateTopicInput, Topic, UpdateTopicInput } from '../types';
import { useHk } from './use-hk';
import { useInfiniteList } from './use-paginated';
import { useApiMutation, useResource, useResourceUpdate } from './use-resource';

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

export function useCreateTopic() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (input: CreateTopicInput) => topicsApi.createTopic(hauskreisId, input),
    { invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived] },
  );
}

/**
 * Solange `status = RUNNING` bleibt, belegt der Server den nächsten Termin
 * automatisch mit demselben Thema vor. Das Umstellen auf `COMPLETED` ist
 * deshalb die Stelle, an der Vorschläge für ein neues Thema aufgehen.
 */
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
 * Ein Thema umbenennen, ohne seinen Einzelstand im Cache zu haben.
 *
 * Liest ihn **selbst**, statt ihn wie `useUpdateTopic` dort zu erwarten: das
 * Archiv zeigt alle abgeschlossenen Themen nebeneinander, und für jedes
 * vorsorglich einen Detail-Stand samt ETag zu holen wäre teurer als einer,
 * wenn wirklich jemand einen Titel ändert. Dasselbe Muster wie
 * `useSetHostWeight`.
 */
export function useRenameTopic() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    async ({ topicId, title }: { topicId: string; title: string | null }) => {
      const current = await topicsApi.getTopic(hauskreisId, topicId);

      return topicsApi.updateTopic(
        hauskreisId,
        topicId,
        { title },
        current.etag,
      );
    },
    { invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived] },
  );
}

/** Zuständige und Admins. Die Abende bleiben stehen, sie verlieren nur ihr Thema. */
export function useDeleteTopic() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (topicId: string) => topicsApi.deleteTopic(hauskreisId, topicId),
    { invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived] },
  );
}

/** Nur Admin. */
export function useCarryOverTopics() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(() => topicsApi.carryOverTopics(hauskreisId), {
    invalidateKeys: [keys.topics.all, keys.meetings.all, ...derived],
  });
}

/** Nur Admin. */
export function useRunTopicReminders() {
  const { hauskreisId } = useHk();
  return useApiMutation(() => topicsApi.runTopicReminders(hauskreisId));
}
