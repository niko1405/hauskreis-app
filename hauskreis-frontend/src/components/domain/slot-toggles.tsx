'use client';

/**
 * „Was gehört dazu" — die fünf Bausteine eines Termins.
 *
 * Ein Geburtstag braucht nicht dieselben Rollen wie ein gewöhnlicher Dienstag:
 * Ohne Thema und Musik fehlt ihm nichts — es war nie vorgesehen.
 *
 * Dieselbe Liste beim Anlegen und beim Bearbeiten, damit „was so ein Abend
 * mitbringt" an beiden Stellen gleich aussieht und gleich heißt.
 */
import { CheckRow } from '@/components/ui/check-row';
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
        <CheckRow
          key={slot.key}
          label={slot.label}
          hint={slot.hint}
          checked={slots[slot.key]}
          disabled={disabled}
          onChange={(value) => onToggle(slot.key, value)}
        />
      ))}
    </div>
  );
}
