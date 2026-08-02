/**
 * `…/topics`. Ein Thema ist nicht 1:1 an einen Termin gebunden — solange es
 * „läuft", wird der nächste Termin damit vorbelegt.
 */
import {
  apiDelete,
  apiGet,
  apiGetResource,
  apiPatch,
  apiPost,
  type Resource,
} from '../client';
import { hkPath } from './paths';
import type { TopicListParams } from '../params';
import type {
  CarryOverResult,
  CreateTopicInput,
  Page,
  ReminderRunResult,
  Topic,
  TopicListItem,
  UpdateTopicInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/topics');

export function listTopics(
  hauskreisId: string,
  params: TopicListParams = {},
  signal?: AbortSignal,
): Promise<Page<TopicListItem>> {
  return apiGet<Page<TopicListItem>>(base(hauskreisId), {
    query: { ...params },
    signal,
  });
}

export function getTopic(
  hauskreisId: string,
  topicId: string,
  options: { previous?: Resource<Topic>; signal?: AbortSignal } = {},
): Promise<Resource<Topic>> {
  return apiGetResource<Topic>(`${base(hauskreisId)}/${topicId}`, options);
}

/** `title` ist optional — nicht jeder trägt vorab einen ein. */
export function createTopic(
  hauskreisId: string,
  input: CreateTopicInput,
): Promise<Topic> {
  return apiPost<Topic>(base(hauskreisId), input);
}

export function updateTopic(
  hauskreisId: string,
  topicId: string,
  input: UpdateTopicInput,
  etag: string | undefined,
): Promise<Resource<Topic>> {
  return apiPatch<Topic>(`${base(hauskreisId)}/${topicId}`, input, { etag });
}

/** Nur Admin. */
export function deleteTopic(
  hauskreisId: string,
  topicId: string,
): Promise<void> {
  return apiDelete(`${base(hauskreisId)}/${topicId}`);
}

/** Nur Admin. Belegt die nächsten Termine mit dem laufenden Thema vor. */
export function carryOverTopics(hauskreisId: string): Promise<CarryOverResult> {
  return apiPost<CarryOverResult>(`${base(hauskreisId)}/carry-over`);
}

/** Nur Admin. */
export function runTopicReminders(
  hauskreisId: string,
): Promise<ReminderRunResult> {
  return apiPost<ReminderRunResult>(`${base(hauskreisId)}/reminders`);
}
