'use client';

/**
 * „Noch etwas dazu?" — das Notizfeld hinter einer Antwort in der Terminliste.
 *
 * Am Termin steht dasselbe Feld fest im Antwort-Balken (`answer-bar.tsx`): Dort
 * ist man *in* einem Abend, und der Balken hat unten dauerhaft Platz. In der
 * Liste gibt es den nicht — dort liest man quer über Wochen, und ein Textfeld
 * an jeder Karte wäre an neun von zehn Karten Ballast. Es kommt deshalb als
 * Sheet, ausgelöst von der Antwort, die man gerade gegeben hat.
 *
 * **Der Status ist schon geschrieben, wenn dieses Sheet aufgeht.** Genau wie im
 * Balken: Ein Tipp auf „Zusagen" ist sofort verbindlich, sonst könnte man
 * antippen, weggehen und nichts gesagt haben. Was hier noch aussteht, ist der
 * Satz dazu — und der ist freiwillig. Deshalb steht links „Ohne Notiz" und
 * nicht „Abbrechen": Abzubrechen gibt es nichts mehr.
 */
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useSetAttendance } from '@/lib/api/hooks';
import { NOTE_FIELD } from './attendance-answers';
import type { AttendanceStatus } from '@/lib/api/types';

export function AnswerNoteSheet({
  meetingId,
  personId,
  /** Der gerade gewählte Status — `null` heißt zu. */
  status,
  /** Was zu diesem Abend schon dasteht. */
  note,
  onClose,
}: {
  meetingId: string;
  personId: string;
  status: AttendanceStatus | null;
  note: string | null;
  onClose: () => void;
}) {
  // Beim Schließen fährt das Sheet nach unten, und `status` ist da schon `null`.
  // Ohne das Gedächtnis wäre der Inhalt in dem Moment leer — man sähe ein
  // leeres Panel wegfahren statt das, was man gerade zugemacht hat.
  const last = useRef<AttendanceStatus | null>(null);
  if (status !== null) last.current = status;
  const shown = status ?? last.current;

  return (
    <Sheet
      open={status !== null}
      onClose={onClose}
      title="Noch etwas dazu?"
      subtitle="Deine Antwort ist schon gespeichert — der Satz ist freiwillig."
    >
      {shown !== null && (
        // Der Entwurf lebt in `Form` und wird über den Schlüssel verworfen,
        // sobald eine andere Antwort gewählt wird: Ein Statuswechsel löscht die
        // Notiz auch auf dem Server, und ein stehengebliebener Satz im Feld
        // würde behaupten, sie gälte noch.
        <Form
          key={shown}
          meetingId={meetingId}
          personId={personId}
          status={shown}
          note={note}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function Form({
  meetingId,
  personId,
  status,
  note,
  onClose,
}: {
  meetingId: string;
  personId: string;
  status: AttendanceStatus;
  note: string | null;
  onClose: () => void;
}) {
  const setAttendance = useSetAttendance(meetingId);
  const [draft, setDraft] = useState(note ?? '');

  const field = NOTE_FIELD[status];
  const FieldIcon = field.icon;
  const trimmed = draft.trim();

  const save = () => {
    // Der Status geht mit raus. Ohne ihn hieße das Weglassen der Notiz laut
    // `useSetAttendance` „behalten, solange der Status bleibt" — und der Server
    // bekäme gar keinen.
    setAttendance.mutate(
      { personId, status, note: trimmed === '' ? null : trimmed },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
        <FieldIcon size={13} className="text-stone-400" />
        {field.label}
      </p>
      {/* Kein `autoFocus`: Auf dem Telefon schöbe die Tastatur das Sheet sofort
          hoch, und der Satz darüber — „deine Antwort ist schon gespeichert" —
          wäre weg, bevor jemand ihn gelesen hat. Dieselbe Entscheidung wie am
          Termin und im Lied-Vorschlag. */}
      <TextArea
        value={draft}
        placeholder={field.placeholder}
        aria-label={field.label}
        className="min-h-24"
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="flex gap-2 pt-2">
        {/* „Schließen", sobald schon ein Satz dasteht: „Ohne Notiz" läse sich
            dort wie „nimm ihn weg", und weggenommen wird er durch ein leeres
            Feld und Speichern. */}
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          {note ? 'Schließen' : 'Ohne Notiz'}
        </Button>
        <Button
          className="flex-1"
          loading={setAttendance.isPending}
          onClick={save}
        >
          Speichern
        </Button>
      </div>
    </div>
  );
}
