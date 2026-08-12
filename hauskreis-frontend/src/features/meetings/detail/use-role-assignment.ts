'use client';

/**
 * Rollen eintragen — die vier Rollen sitzen an zwei Stellen der API, was im UI
 * niemand sehen soll:
 *
 * - **Host** ist ein Feld am Termin (`hostPersonId`) — und untrennbar mit dem
 *   Ort verbunden, weshalb es hier `assignVenue` heißt und beides schickt.
 * - **Testimony** ebenso (`testimonyPersonId`). Anders als das Thema hängt es
 *   am Abend und nicht an einer eigenen Entität: eine Geschichte zieht sich
 *   nicht über drei Dienstage.
 * - **Musik** und **Thema** haben je eine eigene Route (`song-leaders`,
 *   `topic-responsibles`), beide ohne Vorbedingung.
 *
 * Das Thema war hier lange der Sonderfall: es hing an der Themen-Entität, und
 * eine Zuteilung musste erst ein leeres Thema anlegen, um es irgendwo hinhängen
 * zu können. Seit die Zuteilung am Termin steht, ist es ein `PUT` wie die Musik
 * — und **welches** Thema es wird, entscheidet danach, wer zugeteilt ist.
 */
import { useCallback } from 'react';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import {
  useSetSongLeaders,
  useSetTopicResponsibles,
  useUpdateMeeting,
} from '@/lib/api/hooks';
import type { VenueChoice } from '@/components/domain/venue-sheet';
import type { Meeting, PersonRef } from '@/lib/api/types';

export function useRoleAssignment(meeting: Meeting) {
  const toast = useToast();

  const updateMeeting = useUpdateMeeting(meeting.id);
  const setSongLeaders = useSetSongLeaders(meeting.id);
  const setTopicResponsibles = useSetTopicResponsibles(meeting.id);

  const fail = useCallback(
    (error: unknown) => toast.error(errorMessage(error)),
    [toast],
  );

  /**
   * Ort und Gastgeber zusammen — sie sind **eine** Entscheidung.
   *
   * `resolveVenue` im Backend erzwingt das: ein Ort neben einem Gastgeber wird
   * abgewiesen, ein Treffpunkt geht nur, wenn gleichzeitig der Gastgeber
   * herausfällt. Was das Sheet schickt, ist deshalb schon die ganze Antwort —
   * hier wird nichts mehr zusammengesetzt.
   */
  const assignVenue = useCallback(
    (choice: VenueChoice) => {
      updateMeeting.mutate(choice, { onError: fail });
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
      setTopicResponsibles.mutate(personIds, { onError: fail });
    },
    [setTopicResponsibles, fail],
  );

  const assignSongLeaders = useCallback(
    (personIds: string[]) => {
      setSongLeaders.mutate(personIds, { onError: fail });
    },
    [setSongLeaders, fail],
  );

  const topicPeople: PersonRef[] = meeting.topicResponsibles.map(
    (row) => row.person,
  );

  return {
    assignVenue,
    assignTestimony,
    assignTopicResponsibles,
    assignSongLeaders,
    topicPeople,
    /** Der Konflikt aus `useResourceUpdate` — anzuzeigen, nicht zu verschlucken. */
    conflict: updateMeeting.conflict,
    dismissConflict: () => updateMeeting.dismissConflict(),
    saving:
      updateMeeting.isPending ||
      setSongLeaders.isPending ||
      setTopicResponsibles.isPending,
  };
}
