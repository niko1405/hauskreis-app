'use client';

/**
 * Was jemand zu seiner Antwort dazugesagt hat — Verspätung und Satz, jeweils
 * mit ihrem Symbol.
 *
 * Steht einmal, weil zwei Stellen es zeigen: die Zusagenliste am Termin für
 * alle anderen und der Antwort-Balken unten für einen selbst. Als nackter Text
 * im Balken sah der eigene Satz anders aus als derselbe Satz in der Liste
 * darüber — und man erkannte nicht auf einen Blick, ob es eine Verspätung oder
 * eine Info war.
 *
 * Die Verspätung sticht heraus, der Satz nicht: Sie ändert etwas am Abend
 * selbst, ein Satz erklärt nur.
 */
import { cn } from '@/lib/cn';
import type { AttendanceStatus } from '@/lib/api/types';
import { LATE_ICON, NOTE_FIELD, lateLabel } from './attendance-answers';

export function AnswerNote({
  status,
  note,
  lateMinutes,
  compact = false,
  className,
}: {
  status: AttendanceStatus;
  note: string | null;
  lateMinutes: number | null;
  /** Je eine Zeile, abgeschnitten — für den eingeklappten Balken. */
  compact?: boolean;
  className?: string;
}) {
  const late = status === 'ATTENDING' ? lateMinutes : null;
  const NoteIcon = NOTE_FIELD[status].icon;

  if (late === null && !note) return null;

  return (
    <div className={cn('space-y-0.5', className)}>
      {late !== null && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-terracotta-600">
          <LATE_ICON size={13} className="shrink-0" />
          {lateLabel(late)}
        </p>
      )}
      {note && (
        <p
          className={cn(
            'flex gap-1.5 text-xs leading-relaxed text-stone-500',
            compact ? 'items-center' : 'items-start',
          )}
        >
          <NoteIcon
            size={13}
            className={cn('shrink-0', !compact && 'mt-0.5')}
          />
          <span className={cn('min-w-0', compact && 'truncate')}>{note}</span>
        </p>
      )}
    </div>
  );
}
