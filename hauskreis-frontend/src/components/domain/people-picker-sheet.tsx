'use client';

/**
 * Jemanden aus dem Hauskreis heraussuchen — eine Liste, ein Druck, fertig.
 *
 * Bewusst **nicht** `AssignmentPicker`: Der beantwortet „wer wäre als Nächstes
 * dran" und hängt dafür an einem Termin, an Vorschlägen und an einer
 * Verfügbarkeitsprüfung. Hier gibt es nichts vorzuschlagen — wen man zu einer
 * Vorbereitung dazunimmt, weiß man, und der Termin steht vielleicht noch gar
 * nicht fest.
 *
 * Wer schon dabei ist, steht nicht in der Liste: Ihn ein zweites Mal anzubieten
 * hieße, eine Wahl anzubieten, die nichts tut.
 */
import { Avatar } from '@/components/ui/avatar';
import { PRESSABLE } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { usePeople } from '@/lib/api/hooks';

export function PeoplePickerSheet({
  title,
  subtitle,
  excludeIds,
  emptyLabel = 'Alle sind schon dabei.',
  saving = false,
  onPick,
  onClose,
}: {
  title: string;
  subtitle?: string;
  /** Wer schon dabei ist — steht nicht zur Wahl. */
  excludeIds: string[];
  emptyLabel?: string;
  saving?: boolean;
  onPick: (personId: string) => void;
  onClose: () => void;
}) {
  const people = usePeople();

  // Eingeladene zählen nicht mit: Wer sich noch nie angemeldet hat, weiß von
  // keiner Zuteilung und kann nichts vorbereiten.
  const waehlbar = (people.data ?? []).filter(
    (person) => person.acceptedAt !== null && !excludeIds.includes(person.id),
  );

  return (
    <Sheet open onClose={onClose} title={title} subtitle={subtitle}>
      {waehlbar.length === 0 ? (
        <p className="py-4 text-sm text-stone-400">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {waehlbar.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                disabled={saving}
                onClick={() => onPick(person.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors',
                  PRESSABLE,
                  'hover:bg-canvas disabled:opacity-50',
                )}
              >
                <Avatar person={person} size="sm" />
                <span className="text-sm font-medium text-stone-700">
                  {person.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
