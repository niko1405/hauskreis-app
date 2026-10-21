'use client';

/**
 * „Noch etwas dazu?" — das Notizfeld hinter einer Antwort in Liste und Kalender.
 *
 * Am Termin steht dasselbe Feld fest im Antwort-Balken (`answer-bar.tsx`): Dort
 * ist man *in* einem Abend, und der Balken hat unten dauerhaft Platz. In der
 * Liste und im Kalender gibt es den nicht — dort liest man quer über Wochen,
 * und ein Textfeld an jeder Zeile wäre an neun von zehn Zeilen Ballast. Es
 * kommt deshalb als Sheet, ausgelöst von der Antwort, die man gerade gegeben
 * hat.
 *
 * **Der Status ist schon geschrieben, wenn dieses Sheet aufgeht.** Genau wie im
 * Balken: Ein Tipp auf „Zusagen" ist sofort verbindlich, sonst könnte man
 * antippen, weggehen und nichts gesagt haben. Was hier noch aussteht, ist der
 * Satz dazu — und der ist freiwillig. Deshalb steht links „Ohne Notiz" und
 * nicht „Abbrechen": Abzubrechen gibt es nichts mehr.
 */
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useSetAttendance } from '@/lib/api/hooks';
import { AttendanceNoteFields } from './attendance-note-fields';
import type { AttendanceStatus } from '@/lib/api/types';

export function AnswerNoteSheet({
  meetingId,
  personId,
  /** Der gerade gewählte Status — `null` heißt zu. */
  status,
  /** Was zu diesem Abend schon dasteht. */
  note,
  lateMinutes,
  onClose,
}: {
  meetingId: string;
  personId: string;
  status: AttendanceStatus | null;
  note: string | null;
  lateMinutes: number | null;
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
          lateMinutes={lateMinutes}
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
  lateMinutes,
  onClose,
}: {
  meetingId: string;
  personId: string;
  status: AttendanceStatus;
  note: string | null;
  lateMinutes: number | null;
  onClose: () => void;
}) {
  const setAttendance = useSetAttendance(meetingId);
  const [draft, setDraft] = useState(note ?? '');
  const [late, setLate] = useState(status === 'ATTENDING' ? lateMinutes : null);

  const trimmed = draft.trim();

  const save = () => {
    // Der Status geht mit raus. Ohne ihn hieße das Weglassen der Notiz laut
    // `useSetAttendance` „behalten, solange der Status bleibt" — und der Server
    // bekäme gar keinen.
    setAttendance.mutate(
      {
        personId,
        status,
        note: trimmed === '' ? null : trimmed,
        lateMinutes: status === 'ATTENDING' ? late : null,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="space-y-2">
      {/* Kein `autoFocus`: Auf dem Telefon schöbe die Tastatur das Sheet sofort
          hoch, und der Satz darüber — „deine Antwort ist schon gespeichert" —
          wäre weg, bevor jemand ihn gelesen hat. Dieselbe Entscheidung wie am
          Termin und im Lied-Vorschlag. */}
      <AttendanceNoteFields
        status={status}
        note={draft}
        lateMinutes={late}
        onNoteChange={setDraft}
        onLateChange={setLate}
        textAreaClassName="min-h-24"
      />
      <div className="flex gap-2 pt-2">
        {/* „Schließen", sobald schon ein Satz dasteht: „Ohne Notiz" läse sich
            dort wie „nimm ihn weg", und weggenommen wird er durch ein leeres
            Feld und Speichern. */}
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          {note || lateMinutes !== null ? 'Schließen' : 'Ohne Notiz'}
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
