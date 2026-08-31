'use client';

/**
 * Der Punkt auf „Admin-Bereich", bis man ihn einmal geöffnet hat.
 *
 * **Warum es ihn gibt.** Dieselbe Überlegung wie bei „Was sind erste Schritte?"
 * ([[use-unread-help]]): Wer gerade zum Admin ernannt wurde, sieht im Profil
 * einen Knopf mehr — und nichts sagt ihm, dass dahinter Einladungen, der
 * Termin-Rhythmus und die Bausteine der Gruppe stehen. Der Punkt ist kein
 * „ungelesen", sondern ein Wegweiser.
 *
 * **Und er stimmt für später Ernannte von selbst.** Der Merker liegt im Gerät
 * und weiß nichts über Rollen; wer den Bereich nie geöffnet hat, hat ihn nie
 * geöffnet. Gezeigt wird er ohnehin nur, wo auch der Knopf steht.
 */
import { useLocalFlag } from '@/lib/local-flag';

const KEY = 'acts2-seen-admin';

export function useUnreadAdmin(): { unread: boolean; markSeen: () => void } {
  const { set, mark } = useLocalFlag(KEY);
  return { unread: !set, markSeen: mark };
}
