'use client';

/**
 * Was man zur eigenen Antwort noch sagen will — im Antwort-Balken am Termin
 * und im Sheet hinter Liste und Kalender.
 *
 * Bei einer **Zusage** fragt es zuerst, worum es geht: eine Info („bringe noch
 * jemanden mit") oder eine Verspätung. Die Verspätung ist eine Zahl und kein
 * Satz, damit die Anwesenheitsliste sie als solche zeigen kann; ein Satz dazu
 * bleibt trotzdem möglich. Bei „weiß nicht" und einer Absage gibt es nur den
 * Satz.
 *
 * Steht einmal und nicht in beiden Formularen, damit Balken und Sheet dieselbe
 * Frage gleich stellen.
 */
import { Segmented } from '@/components/ui/segmented';
import { TextArea } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import type { AttendanceStatus } from '@/lib/api/types';
import {
  LATE_ICON,
  LATE_OPTIONS,
  NOTE_FIELD,
  lateLabel,
} from './attendance-answers';

/** Womit „Verspätung" vorbelegt ist, solange niemand einen Chip wählt. */
const DEFAULT_LATE = LATE_OPTIONS[0];

export function AttendanceNoteFields({
  status,
  note,
  lateMinutes,
  onNoteChange,
  onLateChange,
  textAreaClassName,
}: {
  status: AttendanceStatus;
  note: string;
  lateMinutes: number | null;
  onNoteChange: (next: string) => void;
  onLateChange: (next: number | null) => void;
  textAreaClassName?: string;
}) {
  const late = status === 'ATTENDING' && lateMinutes !== null;
  const field = NOTE_FIELD[status];
  const FieldIcon = field.icon;
  const label = late ? 'Noch etwas dazu? (optional)' : field.label;

  return (
    <div className="space-y-3">
      {status === 'ATTENDING' && (
        <div className="space-y-2">
          <Segmented
            size="sm"
            label="Worum geht es?"
            value={late ? 'late' : 'info'}
            onChange={(next) =>
              onLateChange(
                next === 'late' ? (lateMinutes ?? DEFAULT_LATE) : null,
              )
            }
            options={[
              { value: 'info', label: 'Info' },
              { value: 'late', label: 'Verspätung' },
            ]}
          />

          {late && (
            <div
              role="radiogroup"
              aria-label="Wie viel später?"
              className="flex flex-wrap gap-1.5"
            >
              {LATE_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  role="radio"
                  aria-checked={lateMinutes === minutes}
                  onClick={() => onLateChange(minutes)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                    lateMinutes === minutes
                      ? 'border-terracotta-500 bg-terracotta-50 text-terracotta-700'
                      : 'border-line bg-card text-stone-500 hover:border-line-strong',
                  )}
                >
                  <LATE_ICON size={12} />
                  {lateLabel(minutes)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
          <FieldIcon size={13} className="text-stone-400" />
          {label}
        </p>
        <TextArea
          value={note}
          placeholder={late ? 'z.B. Stecke noch im Stau…' : field.placeholder}
          aria-label={label}
          className={textAreaClassName}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>
    </div>
  );
}
