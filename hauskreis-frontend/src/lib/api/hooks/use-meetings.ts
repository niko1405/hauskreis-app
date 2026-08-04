'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { STALE } from '../cache';
import type { Resource } from '../client';
import { meetingsApi } from '../endpoints';
import type { MeetingListParams } from '../params';
import type {
  CancelMeetingInput,
  CreateMeetingInput,
  HomeScreen,
  Meeting,
  SetAttendanceInput,
  UpdateMeetingInput,
} from '../types';
import { useHk } from './use-hk';
import { useMe } from './use-me';
import { useInfiniteList } from './use-paginated';
import { useApiMutation, useResource, useResourceUpdate } from './use-resource';

/** Paginierte Terminliste zum Nachladen beim Scrollen. */
export function useMeetingList(params: MeetingListParams = {}) {
  const { hauskreisId, enabled, keys } = useHk();

  return useInfiniteList({
    queryKey: keys.meetings.list(params),
    fetchPage: ({ skip, take, signal }) =>
      meetingsApi.listMeetings(hauskreisId, { ...params, skip, take }, signal),
    enabled,
    staleTime: STALE.list,
  });
}

export function useMeeting(meetingId: string | undefined) {
  const { hauskreisId, enabled, keys } = useHk();

  return useResource<Meeting>(
    keys.meetings.detail(meetingId ?? ''),
    ({ previous, signal }) =>
      meetingsApi.getMeeting(hauskreisId, meetingId!, { previous, signal }),
    { enabled: enabled && Boolean(meetingId), staleTime: STALE.detail },
  );
}

/**
 * Lädt das Detail schon beim Antippen einer Karte vor, damit die Detailseite
 * nicht mit einem leeren Gerüst startet.
 */
export function usePrefetchMeeting() {
  const queryClient = useQueryClient();
  const { hauskreisId, enabled, keys } = useHk();

  return useCallback(
    (meetingId: string) => {
      if (!enabled) return;
      void queryClient.prefetchQuery({
        queryKey: keys.meetings.detail(meetingId),
        queryFn: ({ signal }) =>
          meetingsApi.getMeeting(hauskreisId, meetingId, { signal }),
        staleTime: STALE.detail,
      });
    },
    [queryClient, hauskreisId, enabled, keys],
  );
}

export function useCreateMeeting() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (input: CreateMeetingInput) =>
      meetingsApi.createMeeting(hauskreisId, input),
    { invalidateKeys: [keys.meetings.all, ...derived] },
  );
}

export function useUpdateMeeting(meetingId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useResourceUpdate<Meeting, UpdateMeetingInput>({
    queryKey: keys.meetings.detail(meetingId),
    update: (input, etag) =>
      meetingsApi.updateMeeting(hauskreisId, meetingId, input, etag),
    invalidateKeys: [keys.meetings.all, keys.topics.all, ...derived],
  });
}

/** Sagt den ganzen Abend ab. Nur Admin. */
export function useCancelMeeting(meetingId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useResourceUpdate<Meeting, CancelMeetingInput>({
    queryKey: keys.meetings.detail(meetingId),
    update: (input, etag) =>
      meetingsApi.cancelMeeting(hauskreisId, meetingId, input, etag),
    invalidateKeys: [keys.meetings.all, ...derived],
  });
}

/** Braucht `If-Match`, aber keinen Körper — deshalb `void` als Eingabe. */
export function useUncancelMeeting(meetingId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useResourceUpdate<Meeting, void>({
    queryKey: keys.meetings.detail(meetingId),
    update: (_input, etag) =>
      meetingsApi.uncancelMeeting(hauskreisId, meetingId, etag),
    invalidateKeys: [keys.meetings.all, ...derived],
  });
}

/** Nur Admin. */
export function useDeleteMeeting() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (meetingId: string) => meetingsApi.deleteMeeting(hauskreisId, meetingId),
    { invalidateKeys: [keys.meetings.all, ...derived] },
  );
}

/**
 * Ohne Vorbedingung. Betrifft auch den Home-Screen (`myAttendance`).
 *
 * Greift vor: „Dabei" ist ein Schalter, und ein Schalter, der erst nach der
 * Antwort des Servers umspringt, fühlt sich kaputt an.
 */
export function useSetAttendance(meetingId: string) {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(
    (input: SetAttendanceInput) =>
      meetingsApi.setAttendance(hauskreisId, meetingId, input),
    {
      invalidateKeys: [
        keys.meetings.detail(meetingId),
        keys.meetings.all,
        ...derived,
      ],
      optimistic: async (input, patch) => {
        await patch<Resource<Meeting>>(
          keys.meetings.detail(meetingId),
          (resource) => ({
            ...resource,
            data: {
              ...resource.data,
              attendances: [
                ...resource.data.attendances.filter(
                  (entry) => entry.personId !== input.personId,
                ),
                { personId: input.personId, status: input.status },
              ],
            },
          }),
        );

        // Der Home-Screen zeigt dieselbe Antwort als „Bist du dabei?". Ob es
        // die eigene ist, weiß er hier nicht — aber `myAttendance` steht nur
        // am nächsten Treffen, und dort ist es immer die eigene.
        await patch<HomeScreen>(keys.home, (home) =>
          home.nextMeeting?.id === meetingId
            ? {
                ...home,
                nextMeeting: {
                  ...home.nextMeeting,
                  myAttendance: input.status,
                },
              }
            : home,
        );
      },
    },
  );
}

/**
 * Der Haken am eigenen Actionstep. Ohne Vorbedingung — ein Schalter.
 *
 * Betrifft auch den Home-Screen: dort steht die Erinnerung, dort verschwindet
 * sie, und dort steht „5 von 9 haben's geschafft".
 */
export function useSetActionstepDone(meetingId: string) {
  const { hauskreisId, keys, derived } = useHk();
  const { me } = useMe();

  return useApiMutation(
    (done: boolean) =>
      meetingsApi.setActionstepDone(hauskreisId, meetingId, done),
    {
      invalidateKeys: [
        keys.meetings.detail(meetingId),
        keys.meetings.all,
        ...derived,
      ],
      optimistic: async (done, patch) => {
        if (!me) return;

        await patch<Resource<Meeting>>(
          keys.meetings.detail(meetingId),
          (resource) => ({
            ...resource,
            data: {
              ...resource.data,
              actionstepDone: done
                ? [
                    ...resource.data.actionstepDone,
                    {
                      person: { id: me.id, name: me.name },
                      doneAt: new Date().toISOString(),
                    },
                  ]
                : resource.data.actionstepDone.filter(
                    (entry) => entry.person.id !== me.id,
                  ),
            },
          }),
        );

        await patch<HomeScreen>(keys.home, (home) =>
          home.openActionstep?.meetingId === meetingId
            ? {
                ...home,
                openActionstep: {
                  ...home.openActionstep,
                  done,
                  // Nur zählen, was sich wirklich ändert: zweimal auf denselben
                  // Haken tippen ist kein zweites Abhaken.
                  doneCount:
                    home.openActionstep.done === done
                      ? home.openActionstep.doneCount
                      : home.openActionstep.doneCount + (done ? 1 : -1),
                },
              }
            : home,
        );
      },
    },
  );
}

// ── Vorschläge ──────────────────────────────────────────────────────────────

/**
 * Immer frisch geladen, wenn das Zuteilungs-Sheet aufgeht. Die Fakten in
 * `facts` sind der eigentliche Inhalt — die Reihenfolge allein wäre eine
 * Blackbox und genau das, was die App nicht sein soll (CLAUDE.md §4).
 */
export function useHostSuggestions(
  meetingId: string | undefined,
  active = true,
) {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.meetings.hostSuggestions(meetingId ?? ''),
    queryFn: ({ signal }) =>
      meetingsApi.getHostSuggestions(hauskreisId, meetingId!, signal),
    enabled: enabled && Boolean(meetingId) && active,
    staleTime: STALE.suggestions,
  });
}

export function useTopicSuggestions(
  meetingId: string | undefined,
  active = true,
) {
  const { hauskreisId, enabled, keys } = useHk();

  return useQuery({
    queryKey: keys.meetings.topicSuggestions(meetingId ?? ''),
    queryFn: ({ signal }) =>
      meetingsApi.getTopicSuggestions(hauskreisId, meetingId!, signal),
    enabled: enabled && Boolean(meetingId) && active,
    staleTime: STALE.suggestions,
  });
}

// ── Admin-Läufe ─────────────────────────────────────────────────────────────

export function useGenerateMeetings() {
  const { hauskreisId, keys, derived } = useHk();

  return useApiMutation(() => meetingsApi.generateMeetings(hauskreisId), {
    invalidateKeys: [keys.meetings.all, ...derived],
  });
}

export function useRunHostReminders() {
  const { hauskreisId } = useHk();
  return useApiMutation(() => meetingsApi.runHostReminders(hauskreisId));
}

export function useRunActionstepReminders() {
  const { hauskreisId } = useHk();
  return useApiMutation(() => meetingsApi.runActionstepReminders(hauskreisId));
}
