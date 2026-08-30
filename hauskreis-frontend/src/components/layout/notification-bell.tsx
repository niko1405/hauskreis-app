'use client';

/**
 * Die Glocke mit der Zahl.
 *
 * Die Zahl kommt aus `unreadCount` und nicht aus `unread.length`: Die Liste ist
 * gedeckelt, die Zahl nicht. Ab hundert steht „99+" da — drei Zeichen sind das
 * Meiste, was in einen Kreis dieser Größe passt, und ob es 112 oder 340 sind,
 * ändert an dem, was zu tun ist, nichts.
 *
 * `sr-only` daneben, weil ein Kreis mit einer Ziffer für alle, die nicht
 * hinsehen, nichts ist — wie der Punkt an der Tabbar (`nav.tsx`).
 */
import { Bell } from 'lucide-react';
import { useEffect } from 'react';
import { PRESSABLE } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useInbox, useInboxLiveUpdates } from '@/lib/api/hooks';

export function NotificationBell({
  atTop,
  onClick,
}: {
  atTop: boolean;
  onClick: () => void;
}) {
  const inbox = useInbox();
  const count = inbox.data?.unreadCount ?? 0;

  useInboxLiveUpdates();
  useAppBadge(count);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        count > 0
          ? `Benachrichtigungen, ${count} ungelesen`
          : 'Benachrichtigungen'
      }
      className={cn(
        'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
        PRESSABLE,
        atTop
          ? 'bg-black/25 text-white ring-1 ring-white/20 backdrop-blur-md'
          : 'bg-white/15 text-white ring-1 ring-white/25',
      )}
    >
      <Bell size={17} strokeWidth={2} />
      {count > 0 && (
        <>
          <span
            aria-hidden
            className={cn(
              'absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2',
              // Der Ring nimmt die Farbe, über der er sitzt — sonst
              // verschwimmt der Kreis mit dem, was darunter liegt. Ganz oben
              // ist das der schwarze Schleier über dem Foto, gescrollt der
              // Terracotta-Balken.
              atTop
                ? 'bg-terracotta-500 ring-black/40'
                : 'bg-alert ring-header-bar',
            )}
          >
            {count > 99 ? '99+' : count}
          </span>
          <span className="sr-only">({count} ungelesen)</span>
        </>
      )}
    </button>
  );
}

/**
 * Dieselbe Zahl am App-Symbol auf dem Home-Bildschirm.
 *
 * In `try/catch` und hinter einer Abfrage: Die Schnittstelle gibt es nur in
 * installierten Apps, und in manchen Browsern wirft schon der Zugriff. Ein
 * Abzeichen ist eine nette Zugabe und nichts, wofür eine Seite scheitern darf.
 */
function useAppBadge(count: number): void {
  useEffect(() => {
    try {
      const nav = navigator as Navigator & {
        setAppBadge?: (n?: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
      };

      if (count > 0) void nav.setAppBadge?.(count);
      else void nav.clearAppBadge?.();
    } catch {
      // Kein Abzeichen, keine Folgen.
    }
  }, [count]);
}
