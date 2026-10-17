import { Avatar } from '@/components/ui/avatar';
import { SpeechBubble } from '@/components/ui/speech-bubble';
import type { PersonRef } from '@/lib/api/types';

/**
 * Wer an etwas arbeitet, mit dem, was er dazu sagt — am Thema „hat es
 * angefangen", an der Einheit „bereitet sie vor".
 *
 * Eine Zeile mit Gesicht und Sprechblase statt einer Reihe kleiner Gesichter
 * mit Namen dahinter: Bei zwei, drei Leuten ist Platz für den Satz, und er ist
 * es, der den Unterschied zwischen ihnen macht. `action` steht rechts in der
 * Blase — im Bearbeitungsmodus das Herausnehmen.
 */
export function PersonBubble({
  person,
  note,
  action,
}: {
  person: PersonRef;
  note?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Avatar person={person} size="md" className="mt-0.5 shrink-0" />
      <SpeechBubble surface="card" className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-stone-900">
            {person.name}
          </p>
          {note && <p className="mt-0.5 text-xs text-stone-400">{note}</p>}
        </div>
        {action}
      </SpeechBubble>
    </div>
  );
}
