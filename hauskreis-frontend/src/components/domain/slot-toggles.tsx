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
import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
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

/**
 * Dieselben Schalter als eigene Karte — für die Detailseite.
 *
 * **Sie steht immer da und ist zugeklappt.** Vorher hing sie am
 * Bearbeitungsmodus der Seite und war damit doppelt versteckt: Man musste
 * wissen, dass es sie gibt, *und* einen Schalter am Seitenende finden. Ein
 * Abend, an dem die Lieder fehlen, sah dann aus wie einer ohne Musik-Team.
 *
 * Zugeklappt, weil man das einmal beim Anlegen entscheidet und danach selten —
 * offen wären es fünf Zeilen Formular mitten in einer Seite, die man zum Lesen
 * aufmacht. Der Zähler im Kopf sagt trotzdem, was drinsteht, ohne dass man
 * aufklappt.
 */
export function SlotCard({
  slots,
  disabled,
  onToggle,
}: {
  slots: MeetingSlots;
  disabled?: boolean;
  onToggle: (key: MeetingSlotKey, value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const an = MEETING_SLOTS.filter((slot) => slots[slot.key]).length;

  return (
    <Card className="p-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <h3 className="text-xs font-bold tracking-wider text-stone-400 uppercase">
          Was gehört dazu
        </h3>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-terracotta-600">
          {an}/{MEETING_SLOTS.length} aktiviert
          <ChevronDown
            size={14}
            className={cn('transition-transform', open && 'rotate-180')}
          />
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-3 py-3">
          <SlotToggles slots={slots} disabled={disabled} onToggle={onToggle} />
        </div>
      )}
    </Card>
  );
}
