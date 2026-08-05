'use client';

/**
 * „Was gehört dazu" — die vier Bausteine eines Termins.
 *
 * Ein besonderer Termin verlangte bisher dieselben Rollen wie ein normaler
 * Dienstag: der Geburtstag von Mira stand mit leerem Thema und leerer
 * Musik-Zeile da, als fehlte etwas. Es fehlte aber nichts — es war nie
 * vorgesehen.
 *
 * Dieselbe Liste beim Anlegen und beim Bearbeiten, damit „was so ein Abend
 * mitbringt" an beiden Stellen gleich aussieht und gleich heißt.
 */
import { Card } from '@/components/ui/card';
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
          className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-shell"
        >
          <input
            type="checkbox"
            // Der Text steht daneben im `<span>`, aber die Regel sieht nur
            // Attribute — und ein Beschriftungstext, den man nicht liest, ist
            // für Screenreader auch keiner.
            aria-label={slot.label}
            checked={slots[slot.key]}
            disabled={disabled}
            onChange={(event) => onToggle(slot.key, event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-terracotta-500"
          />
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

/** Dieselben Schalter als eigene Karte — für die Detailseite. */
export function SlotCard({
  slots,
  disabled,
  onToggle,
}: {
  slots: MeetingSlots;
  disabled?: boolean;
  onToggle: (key: MeetingSlotKey, value: boolean) => void;
}) {
  return (
    <Card className="space-y-2">
      <h3 className="text-xs font-bold tracking-wide text-stone-400 uppercase">
        Was gehört dazu
      </h3>
      <SlotToggles slots={slots} disabled={disabled} onToggle={onToggle} />
    </Card>
  );
}
