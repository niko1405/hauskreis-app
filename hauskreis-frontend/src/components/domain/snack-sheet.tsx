'use client';

/**
 * Wer bringt was zu essen mit — eine Liste, mehrere Haken, fertig.
 *
 * Bewusst **nicht** `AssignmentSheet`: Der beantwortet „wer wäre als Nächstes
 * dran" und braucht dafür eine Rangfolge aus Fakten — zuletzt dran, wie oft
 * insgesamt, Auslastung an dem Abend. Bei den Snacks stellt diese Frage
 * niemand. Wer etwas mitbringt, sagt es im Gespräch, und die App trägt es nur
 * ein.
 *
 * Als **Last** zählt die Rolle in den vier anderen Ranglisten trotzdem — wer den
 * Kuchen bringt, ist an dem Abend beschäftigt. Das entscheidet der Server
 * (`collectSnackEvents`), nicht dieses Sheet.
 *
 * **Wer abgesagt hat, steht nicht in der Liste.** Nicht ausgegraut, sondern weg:
 * Der Server lehnt genau diese Eintragung ab (`assertAvailable`), und ein Knopf,
 * der zuverlässig eine Fehlermeldung erzeugt, ist kein Angebot. Dieselbe Regel
 * wie bei den Vorschlagslisten, wo die Abgesagten ebenfalls herausfallen.
 */
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button, PRESSABLE } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { usePeople } from '@/lib/api/hooks';
import { ROLE_QUESTION } from '@/lib/meeting';
import type { AttendanceStatus } from '@/lib/api/types';

export function SnackSheet({
  open,
  onClose,
  selectedIds,
  attendances,
  onSubmit,
  saving = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Wer aktuell eingetragen ist. */
  selectedIds: string[];
  /**
   * Die Antworten dieses Abends — daraus fallen die Abgesagten heraus.
   *
   * Kommt vom Termin herein statt aus einem eigenen Aufruf: Die Zeilen stehen
   * ohnehin in seiner Antwort, und eine zweite Abfrage wäre ein zweiter
   * Ladezustand für eine Frage, die schon beantwortet ist.
   */
  attendances: readonly { personId: string; status: AttendanceStatus }[];
  onSubmit: (personIds: string[]) => void;
  saving?: boolean;
}) {
  const people = usePeople();
  const [draft, setDraft] = useState<string[]>(selectedIds);

  // Beim Öffnen den aktuellen Stand übernehmen — nicht den von letztem Mal.
  useEffect(() => {
    if (open) setDraft(selectedIds);
  }, [open, selectedIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const abgesagt = new Set(
    attendances
      .filter((entry) => entry.status === 'ABSENT')
      .map((entry) => entry.personId),
  );

  const waehlbar = (people.data ?? []).filter(
    (person) =>
      // Eingeladene zählen nicht mit: Wer sich noch nie angemeldet hat, weiß
      // von keiner Zuteilung. Dieselbe Menge wie überall sonst.
      person.acceptedAt !== null &&
      // Wer schon eingetragen ist, bleibt sichtbar — auch wenn er inzwischen
      // abgesagt hat. Sonst ließe sich die Liste nicht mehr ändern, ohne ihn
      // stillschweigend mit hinauszuwerfen.
      (!abgesagt.has(person.id) || selectedIds.includes(person.id)),
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={ROLE_QUESTION.SNACK}
      subtitle="Mehrere möglich"
    >
      {waehlbar.length === 0 ? (
        <p className="py-4 text-sm text-stone-400">
          Für diesen Abend hat niemand zugesagt.
        </p>
      ) : (
        <ul className="space-y-1">
          {waehlbar.map((person) => {
            const gewaehlt = draft.includes(person.id);

            return (
              <li key={person.id}>
                <button
                  type="button"
                  aria-pressed={gewaehlt}
                  onClick={() =>
                    setDraft((current) =>
                      current.includes(person.id)
                        ? current.filter((id) => id !== person.id)
                        : [...current, person.id],
                    )
                  }
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors',
                    PRESSABLE,
                    'hover:bg-canvas',
                  )}
                >
                  <Avatar person={person} size="sm" />
                  <span className="flex-1 text-sm font-medium text-stone-700">
                    {person.name}
                  </span>
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border',
                      gewaehlt
                        ? 'border-terracotta-500 bg-terracotta-500 text-white'
                        : 'border-line-strong',
                    )}
                  >
                    {gewaehlt && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex gap-2 border-t border-line pt-4">
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          className="flex-1"
          loading={saving}
          onClick={() => {
            onSubmit(draft);
            onClose();
          }}
        >
          Übernehmen
        </Button>
      </div>
    </Sheet>
  );
}
