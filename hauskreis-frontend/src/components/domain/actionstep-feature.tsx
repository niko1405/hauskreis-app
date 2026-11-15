'use client';

/**
 * Der Actionstep — hervorgehoben, wie „Actionstep der Woche" auf „Heute".
 *
 * Er ist das, was man vom Abend mitnimmt. Ab dem Abend sitzt der eigene Haken
 * gleich vorn; abgehakt wird die Karte grün, wie auf „Heute". Davor steht dort
 * das Symbol: einen Vorsatz für heute Abend hakt man heute früh nicht ab.
 *
 * **Einmal, für zwei Orte**: die Seite einer Einheit und die Nachbereitung
 * eines Abends ohne Thema. Es ist derselbe Vorsatz, nur an einem anderen
 * Träger — zwei Gestaltungen dafür wären eine Unterscheidung ohne Unterschied.
 * Der Haken hängt in beiden Fällen am Termin.
 */
import { CheckCircle2, Circle, Footprints } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useMe, useSetActionstepDone } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';

export function ActionstepFeature({
  text,
  meetingId,
  done,
  checkable,
  className,
}: {
  text: string;
  /** Der Abend, an dem der Haken hängt — ohne Abend gibt es keinen. */
  meetingId: string | null;
  /** Ob **ich** ihn abgehakt habe. */
  done: boolean;
  /** Ab Abendbeginn und nur mit Abend. */
  checkable: boolean;
  className?: string;
}) {
  const me = useMe();
  // Hooks gibt es nur unbedingt; ohne Abend wird der Knopf nie gezeigt, und der
  // Haken liefe ins Leere.
  const setDone = useSetActionstepDone(meetingId ?? '');
  const abhakbar = checkable && meetingId !== null;
  const checked = abhakbar && done;

  return (
    <Card
      className={cn(
        'transition-colors',
        checked
          ? 'border-success-line bg-success-bg/40'
          : 'border-terracotta-100 bg-terracotta-50/40',
        className,
      )}
    >
      <div className="flex items-start gap-4">
        {abhakbar ? (
          <button
            type="button"
            aria-pressed={checked}
            aria-label={
              checked ? 'Haken wieder wegnehmen' : 'Actionstep abhaken'
            }
            disabled={!me.me || setDone.isPending}
            onClick={() => setDone.mutate(!checked)}
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
              'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
              checked
                ? 'bg-success-bg text-success'
                : 'bg-card text-stone-300 hover:text-terracotta-500',
            )}
          >
            {checked ? <CheckCircle2 size={22} /> : <Circle size={22} />}
          </button>
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-terracotta-500">
            <Footprints size={20} />
          </span>
        )}
        <div className="min-w-0 pt-0.5">
          <p
            className={cn(
              'text-[10px] font-bold tracking-widest uppercase',
              checked ? 'text-success' : 'text-terracotta-500',
            )}
          >
            Actionstep
          </p>
          <p className="mt-0.5 font-serif text-lg leading-snug font-bold whitespace-pre-line text-stone-900">
            {text}
          </p>
          {abhakbar && (
            <p className="mt-1 text-[11px] text-stone-400">
              {checked
                ? 'Du hast es geschafft.'
                : 'Tipp auf den Kreis, wenn du es geschafft hast.'}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
