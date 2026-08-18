'use client';

/**
 * Der Punkt, der beim allerersten Start auf „Was sind erste Schritte?" zeigt.
 *
 * **Warum es ihn gibt.** Wer sich frisch anmeldet, sieht eine App voller
 * Karten, von denen keine sagt, was jetzt zu tun ist — Anzeigename, Foto,
 * Geburtstag, Benachrichtigungen. Die Antwort steht in der Hilfe, aber niemand
 * öffnet eine Hilfe, von der er nicht weiß, dass sie etwas für ihn hat. Der
 * Punkt ist deshalb kein „ungelesen", sondern ein Wegweiser.
 *
 * **Weg ist er erst, wenn die Antwort dastand** — nicht schon, wenn man die
 * Hilfe irgendwann einmal geöffnet hat. Genau dafür schaltet der Hilfe-Bildschirm
 * die Frage von selbst auf, springt hin und ruft danach `mark()`.
 *
 * Der Punkt gilt für **jedes Gerät einzeln** und trifft deshalb auch die, die
 * die App längst benutzen — einmal. Das ist kein Versehen: Die Frage ist seit
 * kurzem da, und wer sie noch nie gesehen hat, hat sie noch nie gesehen.
 */
import { useLocalFlag } from '@/lib/local-flag';

const KEY = 'acts2-seen-first-steps';

export function useUnreadFirstSteps(): {
  unread: boolean;
  markSeen: () => void;
} {
  const { set, mark } = useLocalFlag(KEY);
  return { unread: !set, markSeen: mark };
}
