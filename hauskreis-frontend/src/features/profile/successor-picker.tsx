'use client';

/**
 * „Wer übernimmt?" — die Nachfolge, wenn die einzige Admin-Person geht.
 *
 * Gebraucht an drei Stellen, und bei allen dreien ist es derselbe Schritt:
 * Verlassen und Konto löschen (`LeaveSheet`), eine Einladung in einen anderen
 * Hauskreis annehmen, und über einen Link wechseln. Jedes Mal fragt der Server
 * mit `400` danach, und jedes Mal ist die Antwort eine Person aus dem
 * Hauskreis, den man gerade verlässt.
 *
 * Erst zeigen, wenn der Server gefragt hat: Ob eine Nachfolge nötig ist, weiß
 * nur er — vorher stünde hier meistens eine überflüssige Auswahl im Weg.
 */
import { Select } from '@/components/ui/field';
import { useMe, usePeople } from '@/lib/api/hooks';

export function SuccessorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (personId: string) => void;
}) {
  const people = usePeople();
  const { me } = useMe();

  const others = (people.data ?? []).filter(
    (person) => person.active && person.id !== me?.id,
  );

  return (
    <div className="space-y-2 rounded-md border border-warn-line bg-warn-bg p-3">
      <p className="text-xs leading-relaxed text-warn">
        Du bist die einzige Person mit Admin-Rechten. Bestimme, wer übernimmt —
        sonst kann danach niemand mehr einladen.
      </p>
      <Select
        value={value}
        aria-label="Nachfolge"
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Bitte wählen</option>
        {others.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
