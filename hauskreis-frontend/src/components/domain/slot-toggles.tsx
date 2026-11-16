'use client';

/**
 * „Was gehört dazu" — die sechs Bausteine eines Termins.
 *
 * Ein Geburtstag braucht nicht dieselben Rollen wie ein gewöhnlicher Dienstag:
 * Ohne Thema und Musik fehlt ihm nichts — es war nie vorgesehen.
 *
 * Dieselbe Liste beim Anlegen und beim Bearbeiten, damit „was so ein Abend
 * mitbringt" an beiden Stellen gleich aussieht und gleich heißt.
 *
 * **Die Nachbereitung ist neben dem Thema ausgegraut und aus**: Am Themenabend
 * tragen Zusammenfassung und Actionstep die Einheit, zwei davon gibt es nicht.
 * Ausgegraut statt verschwunden, damit sie beim Abhaken des Themas nicht aus
 * der Liste springt — und man sieht, warum sie nicht geht.
 *
 * **Was die Gruppe abgeschaltet hat, steht gar nicht da** (`hidden`) — das
 * Testimony etwa. Welche das sind, entscheidet der Aufrufer: Am Anlegen fehlt
 * es dann immer, am Bearbeiten nur, wenn der Abend es nicht schon hat.
 */
import { CheckRow } from '@/components/ui/check-row';
import { MEETING_SLOTS } from '@/lib/meeting';
import type { MeetingSlotKey, MeetingSlots } from '@/lib/meeting';

export function SlotToggles({
  slots,
  disabled,
  hidden,
  onToggle,
}: {
  slots: MeetingSlots;
  disabled?: boolean;
  /** Bausteine, die es in der Gruppe nicht gibt. */
  hidden?: readonly MeetingSlotKey[];
  /** Bekommt den Schalter und den neuen Zustand — nie das ganze Objekt. */
  onToggle: (key: MeetingSlotKey, value: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      {MEETING_SLOTS.filter((slot) => !hidden?.includes(slot.key)).map(
        (slot) => {
          const byTopic = slot.key === 'hasNotesSlot' && slots.hasTopicSlot;

          return (
            <CheckRow
              key={slot.key}
              label={slot.label}
              hint={byTopic ? 'Beim Thema gehört sie zur Einheit.' : slot.hint}
              checked={slots[slot.key] && !byTopic}
              disabled={disabled || byTopic}
              onChange={(value) => onToggle(slot.key, value)}
            />
          );
        },
      )}
    </div>
  );
}
