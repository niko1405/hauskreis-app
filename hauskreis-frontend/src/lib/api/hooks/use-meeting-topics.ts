'use client';

/**
 * Die Rolle „Thema" an einem Abend — zuteilen und wählen.
 *
 * Getrennt von `use-topics.ts`, weil es hier um den *Termin* geht und nicht um
 * das Thema: dieselbe Trennung wie im Backend, wo `MeetingTopicController` an
 * Termin-Pfaden hängt und trotzdem im `TopicModule` liegt.
 */
import { STALE } from '../cache';
import { meetingTopicsApi } from '../endpoints';
import type { ChooseTopicSessionInput, TopicChoices } from '../types';
import { useHk } from './use-hk';
import { useApiMutation } from './use-resource';
import { useQuery } from '@tanstack/react-query';

/**
 * Was zur Wahl steht: eigene Themen und eigene Entwürfe.
 *
 * `enabled` gesteuert, weil nur das offene Auswahl-Sheet das braucht — und
 * `staleTime: 0`, weil ein Entwurf, den man zwei Minuten vorher angefangen hat,
 * sofort dastehen soll.
 */
export function useTopicChoices(meetingId: string, active: boolean) {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery<TopicChoices>({
    queryKey: keys.meetings.topicChoices(meetingId),
    queryFn: ({ signal }) =>
      meetingTopicsApi.getTopicChoices(hauskreisId, meetingId, signal),
    enabled: enabled && active,
    staleTime: STALE.suggestions,
  });
}

/**
 * Setzt, wer an diesem Abend das Thema vorbereitet — die ganze Liste, ohne
 * Vorbedingung. Leer ist gültig und heißt „noch kein Zuständiger".
 */
export function useSetTopicResponsibles(meetingId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (personIds: string[]) =>
      meetingTopicsApi.setTopicResponsibles(hauskreisId, meetingId, personIds),
    {
      invalidateKeys: [keys.meetings.all, keys.topics.all, ...derived],
    },
  );
}

/** Die Wahl treffen. Wer zuerst wählt, wird Owner des Themas. */
export function useChooseTopicSession(meetingId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (input: ChooseTopicSessionInput) =>
      meetingTopicsApi.chooseTopicSession(hauskreisId, meetingId, input),
    {
      invalidateKeys: [keys.meetings.all, keys.topics.all, ...derived],
    },
  );
}

/**
 * Nimmt die Wahl zurück; die Einheit wird wieder ein Entwurf und behält alles,
 * was schon darin steht. Nur solange der Abend bevorsteht.
 */
export function useUnlinkTopicSession(meetingId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    () => meetingTopicsApi.unlinkTopicSession(hauskreisId, meetingId),
    {
      invalidateKeys: [keys.meetings.all, keys.topics.all, ...derived],
    },
  );
}
