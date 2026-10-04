'use client';

/**
 * „Was gehört dazu" — die fünf Bausteine eines Termins.
 *
 * Ein selbst angelegter Termin verlangte bisher dieselben Rollen wie ein
 * gewöhnlicher Dienstag: der Geburtstag von Mira stand mit leerem Thema und
 * leerer Musik-Zeile da, als fehlte etwas. Es fehlte aber nichts — es war nie
 * vorgesehen.
 *
 * Dieselbe Liste beim Anlegen und beim Bearbeiten, damit „was so ein Abend
 * mitbringt" an beiden Stellen gleich aussieht und gleich heißt.
 */
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MEETING_SLOTS } from '@/lib/meeting';
import type { MeetingSlotKey, MeetingSlots } from '@/lib/meeting';

export function SlotToggles({
  slots,
  disabled,
  onToggle,
}: {
  slots: MeetingSlots;
  disabled?: boolean;
  /** Bekommt den Schalter und den neuen Zustand — nie das ganze Objekt. */
  onToggle: (key: MeetingSlotKey, value: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      {MEETING_SLOTS.map((slot) => (
        <label
          key={slot.key}
          className={cn(
            'flex items-start gap-3 rounded-lg p-2 hover:bg-shell',
            disabled ? 'cursor-default opacity-60' : 'cursor-pointer',
          )}
        >
          {/* **Das Kästchen ist gezeichnet, nicht das des Browsers.** Über
              `accent-color` bekommt man einen Haken in Terracotta, aber Form,
              Rundung und Größe bleiben die des Systems — und die sehen auf
              iOS, Android und im Fenster dreierlei aus. Der Eingabeknoten
              bleibt trotzdem der echte: er trägt Tastatur, Fokus und
              Screenreader, das `<span>` daneben trägt nur das Bild. */}
          <input
            type="checkbox"
            // Der Text steht daneben im `<span>`, aber die Regel sieht nur
            // Attribute — und ein Beschriftungstext, den man nicht liest, ist
            // für Screenreader auch keiner.
            aria-label={slot.label}
            checked={slots[slot.key]}
            disabled={disabled}
            onChange={(event) => onToggle(slot.key, event.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
              'border-line-strong bg-card text-transparent',
              'peer-checked:border-terracotta-500 peer-checked:bg-terracotta-500 peer-checked:text-white',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-terracotta-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card',
            )}
          >
            <Check size={13} strokeWidth={3} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-stone-800">
              {slot.label}
            </span>
            <span className="block text-[11px] leading-relaxed text-stone-400">
              {slot.hint}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
