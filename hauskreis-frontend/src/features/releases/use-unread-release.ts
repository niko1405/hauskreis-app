'use client';

/**
 * Gibt es etwas Neues, das man noch nicht gelesen hat?
 *
 * Eine Stelle für eine Regel, die an drei Orten gebraucht wird: am Punkt an der
 * Profil-Leiste, am Punkt in der App-Karte und im Hinweis auf „Heute". Stünde
 * sie dreimal da, wären es bald drei verschiedene.
 *
 * **Gelesen heißt geöffnet**, nicht weggeklickt — „Später" im Hinweis merkt
 * sich `dismissed` und lässt den Punkt stehen ([[release-storage]]).
 *
 * Ohne Netz oder vor der ersten Antwort ist `unread` schlicht `false`: Die
 * Liste kommt vom Server und wird nicht zwischengespeichert. Lieber kein Punkt
 * als einer, der beim Laden aufblitzt.
 */
import { useReleases } from '@/lib/api/hooks';
import { useSeenRelease } from '@/lib/release-storage';

export function useUnreadRelease(): {
  unread: boolean;
  version: string | null;
} {
  const releases = useReleases();
  const { seen } = useSeenRelease();

  const newest = releases.data?.[0];
  if (!newest) return { unread: false, version: null };

  // `seen === null` heißt „noch nie etwas angesehen" — beim allerersten Start
  // ist tatsächlich alles neu.
  return { unread: seen !== newest.version, version: newest.version };
}
