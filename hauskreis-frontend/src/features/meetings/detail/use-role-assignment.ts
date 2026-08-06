'use client';

/**
 * Rollen eintragen — die vier Rollen sitzen an drei verschiedenen Stellen der
 * API, was im UI niemand sehen soll:
 *
 * - **Host** ist ein Feld am Termin (`hostPersonId`).
 * - **Testimony** ebenso (`testimonyPersonId`). Anders als das Thema hängt es
 *   am Abend und nicht an einer eigenen Entität: eine Geschichte zieht sich
 *   nicht über drei Dienstage.
 * - **Thema** hängt am *Thema*, nicht am Termin. Hat der Termin noch keins,
 *   wird eines angelegt und verknüpft — ein Thema kann sich schließlich über
 *   mehrere Termine ziehen (CLAUDE.md §5).
 * - **Musik** hat eine eigene Route (`song-leaders`, ohne Vorbedingung).
 */
import { useCallback } from 'react';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import {
  useCreateTopic,
  useSetSongLeaders,
  useTopic,
  useUpdateMeeting,
  useUpdateTopic,
} from '@/lib/api/hooks';
import type { Meeting, PersonRef } from '@/lib/api/types';

export function useRoleAssignment(meeting: Meeting) {
  const toast = useToast();

  const updateMeeting = useUpdateMeeting(meeting.id);
  const createTopic = useCreateTopic();
  // Lädt das Thema in den Cache — der ETag daraus wird zum Speichern gebraucht.
  const topic = useTopic(meeting.topicId ?? undefined);
  const updateTopic = useUpdateTopic(meeting.topicId ?? '');
  const setSongLeaders = useSetSongLeaders(meeting.id);

  const fail = useCallback(
    (error: unknown) => toast.error(errorMessage(error)),
    [toast],
  );

  const assignHost = useCallback(
    (personIds: string[]) => {
      updateMeeting.mutate(
        { hostPersonId: personIds[0] ?? null },
        { onError: fail },
      );
    },
    [updateMeeting, fail],
  );

  const assignTestimony = useCallback(
    (personIds: string[]) => {
      updateMeeting.mutate(
        { testimonyPersonId: personIds[0] ?? null },
        { onError: fail },
      );
    },
    [updateMeeting, fail],
  );

  const assignTopicResponsibles = useCallback(
    (personIds: string[]) => {
      if (meeting.topicId) {
        updateTopic.mutate(
          { responsiblePersonIds: personIds },
          { onError: fail },
        );
        return;
      }
      // Noch kein Thema am Termin: eines anlegen und verknüpfen. Ohne Titel —
      // den trägt ein, wer sich vorbereitet.
      createTopic.mutate(
        { responsiblePersonIds: personIds },
        {
          onSuccess: (created) =>
            updateMeeting.mutate({ topicId: created.id }, { onError: fail }),
          onError: fail,
        },
      );
    },
    [meeting.topicId, updateTopic, createTopic, updateMeeting, fail],
  );

  const assignSongLeaders = useCallback(
    (personIds: string[]) => {
      setSongLeaders.mutate(personIds, { onError: fail });
    },
    [setSongLeaders, fail],
  );

  /**
   * Den Namen des Themas ändern.
   *
   * Geht über `useUpdateTopic` und damit über den ETag des Themas — der liegt
   * im Cache, weil `useTopic` oben das Thema ohnehin lädt. Ohne verknüpftes
   * Thema passiert nichts: dann gibt es keinen Namen zu ändern, und die Karte
   * bietet ihn auch nicht an.
   */
  const renameTopic = useCallback(
    (title: string | null) => {
      if (!meeting.topicId) return;
      updateTopic.mutate({ title }, { onError: fail });
    },
    [meeting.topicId, updateTopic, fail],
  );

  const topicPeople: PersonRef[] = (
    topic.data?.data.responsibles ??
    meeting.topic?.responsibles ??
    []
  ).map((r) => r.person);

  return {
    assignHost,
    assignTestimony,
    assignTopicResponsibles,
    assignSongLeaders,
    renameTopic,
    topicPeople,
    /** Der Konflikt aus `useResourceUpdate` — anzuzeigen, nicht zu verschlucken. */
    conflict: updateMeeting.conflict || updateTopic.conflict,
    dismissConflict: () => {
      updateMeeting.dismissConflict();
      updateTopic.dismissConflict();
    },
    saving:
      updateMeeting.isPending ||
      updateTopic.isPending ||
      createTopic.isPending ||
      setSongLeaders.isPending,
  };
}
