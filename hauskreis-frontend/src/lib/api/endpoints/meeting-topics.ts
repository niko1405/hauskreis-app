/**
 * Die Rolle „Thema" an einem einzelnen Abend.
 *
 * Zwei Schritte, die bis vor Kurzem einer waren: **zuteilen** („an diesem Abend
 * bist du dran") und **wählen** („und zwar mit diesem Stoff"). Dazwischen liegt
 * der Zustand, um den es geht — zugeteilt, aber noch nichts entschieden.
 */
import { apiDelete, apiGet, apiPost, apiPut, UNCONDITIONAL } from '../client';
import { hkPath } from './paths';
import type {
  ChooseTopicSessionInput,
  TopicChoices,
  TopicResponsibles,
  TopicSession,
} from '../types';

const base = (hauskreisId: string, meetingId: string) =>
  hkPath(hauskreisId, `/meetings/${meetingId}`);

export function getTopicResponsibles(
  hauskreisId: string,
  meetingId: string,
  signal?: AbortSignal,
): Promise<TopicResponsibles> {
  return apiGet<TopicResponsibles>(
    `${base(hauskreisId, meetingId)}/topic-responsibles`,
    { signal },
  );
}

/**
 * Setzt die komplette Liste; ohne Vorbedingung, wie bei der Musik.
 *
 * Bleibt danach niemand zugeteilt, der zum gewählten Thema gehört, löst der
 * Server die Einheit vom Abend — der Inhalt bleibt als Entwurf erhalten.
 */
export function setTopicResponsibles(
  hauskreisId: string,
  meetingId: string,
  personIds: string[],
): Promise<TopicResponsibles> {
  return apiPut<TopicResponsibles>(
    `${base(hauskreisId, meetingId)}/topic-responsibles`,
    { personIds },
    UNCONDITIONAL,
  ).then((r) => r.data);
}

/** Eigene Themen und eigene Entwürfe — die Optionen B und C aus Spec §3. */
export function getTopicChoices(
  hauskreisId: string,
  meetingId: string,
  signal?: AbortSignal,
): Promise<TopicChoices> {
  return apiGet<TopicChoices>(`${base(hauskreisId, meetingId)}/topic-choices`, {
    signal,
  });
}

/** Die Wahl treffen. Wer zuerst wählt, wird Owner des Themas. */
export function chooseTopicSession(
  hauskreisId: string,
  meetingId: string,
  input: ChooseTopicSessionInput,
): Promise<TopicSession> {
  return apiPost<TopicSession>(
    `${base(hauskreisId, meetingId)}/topic-session`,
    input,
  );
}

/** Nimmt die Wahl zurück. Nur solange der Abend bevorsteht. */
export function unlinkTopicSession(
  hauskreisId: string,
  meetingId: string,
): Promise<void> {
  return apiDelete(`${base(hauskreisId, meetingId)}/topic-session`);
}
