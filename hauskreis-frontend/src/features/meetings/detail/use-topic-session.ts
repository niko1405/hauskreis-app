'use client';

/**
 * Die Einheit dieses Abends wieder lösen.
 *
 * Das **Lösen** gehört dem Abend und geht über `…/meetings/:id/topic-session` —
 * anders als der **Inhalt**, der der Einheit gehört und auf ihrer eigenen Seite
 * geschrieben wird (`useUpdateTopicSession`). Hier stand einmal beides
 * nebeneinander, weil die Terminkarte auch die Felder trug; seit die Einheit
 * eine eigene Seite hat, ist der Inhalt dort und nur noch das Lösen hier.
 */
import { useCallback } from 'react';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import { useUnlinkTopicSession } from '@/lib/api/hooks';

export function useTopicSessionActions(meetingId: string) {
  const toast = useToast();
  const unlinkSession = useUnlinkTopicSession(meetingId);

  const unlink = useCallback(() => {
    unlinkSession.mutate(undefined, {
      onSuccess: () =>
        toast.show('Auswahl zurückgenommen — vorbereitet bleibt vorbereitet.'),
      onError: (error) => toast.error(errorMessage(error)),
    });
  }, [unlinkSession, toast]);

  return { unlink, saving: unlinkSession.isPending };
}
