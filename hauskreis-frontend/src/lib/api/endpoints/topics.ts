/**
 * `…/topics` und `…/topic-sessions`.
 *
 * Ein Thema ist nicht an einen Termin gebunden: es zieht sich über beliebig
 * viele **Einheiten**, und jede davon hängt an höchstens einem Abend. Der Inhalt
 * — Titel, Actionstep, Zusammenfassung — sitzt an der Einheit, damit er einen
 * Rollenwechsel überlebt.
 *
 * Angelegt wird ein Thema auf **zwei** Wegen: beim Wählen an einem Abend
 * (`endpoints/meeting-topics.ts`) oder hier, im Voraus und ohne Termin. Der
 * zweite kam dazu, als Einheiten ohne Abend möglich wurden — seitdem ist das
 * Vorarbeiten selbst der Anlass.
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
  CreateTopicInput,
  CreateTopicSessionInput,
  NameTopicInput,
  Page,
  ReminderRunResult,
  Topic,
  TopicListItem,
  TopicSession,
  UpdateTopicInput,
  UpdateTopicSessionInput,
} from '../types';

const base = (hauskreisId: string) => hkPath(hauskreisId, '/topics');
const sessions = (hauskreisId: string) =>
  hkPath(hauskreisId, '/topic-sessions');

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

/** Wer anlegt, wird Owner. Einheiten kommen danach auf der Themenseite dazu. */
export function createTopic(
  hauskreisId: string,
  input: CreateTopicInput,
): Promise<Topic> {
  return apiPost<Topic>(base(hauskreisId), input);
}

export function getTopic(
  hauskreisId: string,
  topicId: string,
  options: { previous?: Resource<Topic>; signal?: AbortSignal } = {},
): Promise<Resource<Topic>> {
  return apiGetResource<Topic>(`${base(hauskreisId)}/${topicId}`, options);
}

export function updateTopic(
  hauskreisId: string,
  topicId: string,
  input: UpdateTopicInput,
  etag: string | undefined,
): Promise<Resource<Topic>> {
  return apiPatch<Topic>(`${base(hauskreisId)}/${topicId}`, input, { etag });
}

/** Nur der Owner (und Admins). Löscht das Thema samt aller Einheiten. */
export function deleteTopic(
  hauskreisId: string,
  topicId: string,
): Promise<void> {
  return apiDelete(`${base(hauskreisId)}/${topicId}`);
}

/**
 * Nimmt jemandem das Bearbeitungsrecht. Nur der Owner darf das; was die Person
 * gehalten hat, bleibt an den Einheiten stehen.
 */
export function removeCollaborator(
  hauskreisId: string,
  topicId: string,
  personId: string,
): Promise<void> {
  return apiDelete(`${base(hauskreisId)}/${topicId}/collaborators/${personId}`);
}

/**
 * Eine Einheit anlegen, ohne dass ein Abend dafür feststeht.
 *
 * Der Weg, sein Thema in Ruhe vorzubereiten: Titel und Gedanken schreibt man
 * auf, wenn man sie hat, und sucht sich den Dienstag später. Sie taucht danach
 * beim Wählen unter „Angefangenes" auf.
 */
export function createTopicSession(
  hauskreisId: string,
  topicId: string,
  input: CreateTopicSessionInput,
): Promise<TopicSession> {
  return apiPost<TopicSession>(
    `${base(hauskreisId)}/${topicId}/sessions`,
    input,
  );
}

/**
 * Eine **einzelne** Einheit anlegen — ohne Thema und ohne Abend.
 *
 * Nicht jeder Abend spannt einen Bogen. Wer nur einen vorbereiten will, sollte
 * kein Thema erfinden müssen, das nie ein zweites Mal vorkommt.
 */
export function createStandaloneSession(
  hauskreisId: string,
  input: CreateTopicSessionInput,
): Promise<TopicSession> {
  return apiPost<TopicSession>(sessions(hauskreisId), input);
}

/**
 * Das Überthema: aus einer einzelnen Einheit wird ein Thema.
 *
 * Ohne ETag, weil der Aufruf nichts überschreibt, das zwei Menschen verschieden
 * ausfüllen könnten — ein zweiter endet im Konflikt statt in einem zweiten
 * Titel.
 */
export function nameTopic(
  hauskreisId: string,
  sessionId: string,
  input: NameTopicInput,
): Promise<Resource<TopicSession>> {
  return apiPatch<TopicSession>(
    `${sessions(hauskreisId)}/${sessionId}/topic`,
    input,
    { etag: undefined },
  );
}

/** Nur, solange die Einheit noch nicht gehalten wurde. */
export function deleteTopicSession(
  hauskreisId: string,
  sessionId: string,
): Promise<void> {
  return apiDelete(`${sessions(hauskreisId)}/${sessionId}`);
}

export function getTopicSession(
  hauskreisId: string,
  sessionId: string,
  options: { previous?: Resource<TopicSession>; signal?: AbortSignal } = {},
): Promise<Resource<TopicSession>> {
  return apiGetResource<TopicSession>(
    `${sessions(hauskreisId)}/${sessionId}`,
    options,
  );
}

/** Titel, Actionstep und Zusammenfassung eines einzelnen Abends. */
export function updateTopicSession(
  hauskreisId: string,
  sessionId: string,
  input: UpdateTopicSessionInput,
  etag: string | undefined,
): Promise<Resource<TopicSession>> {
  return apiPatch<TopicSession>(
    `${sessions(hauskreisId)}/${sessionId}`,
    input,
    { etag },
  );
}

/** Nur Admin. */
export function runTopicReminders(
  hauskreisId: string,
): Promise<ReminderRunResult> {
  return apiPost<ReminderRunResult>(`${base(hauskreisId)}/reminders`);
}
