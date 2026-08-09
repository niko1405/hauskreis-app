'use client';

/**
 * Die Einheit dieses Abends schreiben und wieder lösen.
 *
 * Zwei Wege, die auseinandergehen: der **Inhalt** gehört der Einheit und wird
 * über `…/topic-sessions/:id` geändert, das **Lösen** gehört dem Abend und geht
 * über `…/meetings/:id/topic-session`. Im UI ist beides dieselbe Karte, deshalb
 * hier zusammengefasst — genau wie `useRoleAssignment` es für die vier Rollen
 * tut.
 *
 * Der ETag der Einheit liegt nirgends im Cache: sie steht im Termin-DTO und
 * nicht als eigene Ressource. `useEditTopicSession` holt ihn deshalb beim
 * Schreiben — dasselbe Muster wie beim Umbenennen aus der Archivliste.
 */
import { useCallback } from 'react';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import { useEditTopicSession, useUnlinkTopicSession } from '@/lib/api/hooks';
import type { Meeting, UpdateTopicSessionInput } from '@/lib/api/types';

export function useTopicSessionActions(meeting: Meeting) {
  const toast = useToast();
  const edit = useEditTopicSession();
  const unlinkSession = useUnlinkTopicSession(meeting.id);

  const sessionId = meeting.topicSession?.id;

  const patch = useCallback(
    (input: UpdateTopicSessionInput) => {
      if (!sessionId) return;
      edit.mutate(
        { sessionId, input },
        { onError: (error) => toast.error(errorMessage(error)) },
      );
    },
    [sessionId, edit, toast],
  );

  const unlink = useCallback(() => {
    unlinkSession.mutate(undefined, {
      onSuccess: () =>
        toast.show('Auswahl zurückgenommen — vorbereitet bleibt vorbereitet.'),
      onError: (error) => toast.error(errorMessage(error)),
    });
  }, [unlinkSession, toast]);

  return { patch, unlink, saving: edit.isPending || unlinkSession.isPending };
}
