'use client';

/**
 * Wer kommt — und was die Einzelnen dazu zu sagen haben.
 *
 * **„Weiß noch nicht" zählt mit.** Die Karte sagte „3 von 9" und meinte damit
 * nur die ausdrücklichen Zusagen; die Kapazitätsregel des Servers rechnet seit
 * jeher mit `groupSize − declined` (`countExpectedAttendance`), also mit allen
 * außer den Absagen. Zwei Zahlen über denselben Abend, und die sichtbare war
 * die knappere — als Gastgeber plant man lieber mit einem zu viel als mit einem
 * zu wenig. Jetzt steht dort dieselbe Menge, nach der auch eingeteilt wird.
 *
 * **Eine Liste statt eines Rasters.** Vorher standen die Zusagen als Kacheln
 * da, und Absagen wie Schweigen verschwanden gemeinsam hinter einer aufklappbaren
 * Zeile mit Namen in einer Reihe. Wer plant, will sie aber nebeneinander sehen:
 * oben die Sicheren, darunter die Unentschiedenen — und die Abgesagten für sich,
 * weil sie eine andere Frage beantworten.
 *
 * **Der eine Satz zur Antwort** ist das, was vorher in WhatsApp stand. Er hängt
 * an der Anwesenheitszeile (`note`), gilt für alle drei Status und wechselt nur
 * seine Beschriftung: eine Verspätung, ein „muss schauen, wann Feierabend ist",
 * ein Grund fürs Fehlen.
 *
 * **Die eigene Antwort steht nicht mehr hier**, sondern unten am Bildschirm
 * (`answer-bar.tsx`). Diese Karte sagt, wer kommt; dass man selbst dazugehört,
 * ist eine andere Frage, und die soll nicht am Ende einer Liste stehen, zu der
 * man erst scrollen muss. Farben, Kurzformen und die Symbole der Sätze sind mit
 * ihr in `domain/attendance-answers.ts` gezogen — beide brauchen sie, und zwei
 * Kopien wären zwei Meinungen darüber, welche Farbe „abgesagt" hat.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Card, SectionTitle } from '@/components/ui/card';
import { useMe, usePeople } from '@/lib/api/hooks';
import { ANSWER, NOTE_FIELD } from '@/components/domain/attendance-answers';
import { cn } from '@/lib/cn';
import type { AttendanceStatus, Meeting, Person } from '@/lib/api/types';

export function AttendanceCard({
  meeting,
  readOnly = false,
}: {
  meeting: Meeting;
  /** Ein vergangener oder abgesagter Abend: daran ändert niemand mehr etwas. */
  readOnly?: boolean;
}) {
  const people = usePeople();
  const me = useMe();
  const [showAbsent, setShowAbsent] = useState(false);

  const rowOf = (personId: string) =>
    meeting.attendances.find((entry) => entry.personId === personId);
  const statusOf = (personId: string): AttendanceStatus =>
    rowOf(personId)?.status ?? 'UNKNOWN';

  // Eingeladene zählen nicht mit: Wer sich noch nie angemeldet hat, kann nicht
  // antworten und stünde auf ewig unter „weiß noch nicht". Der Server rechnet
  // für „alle haben abgesagt" mit derselben Menge. Ausgetretene kommen gar
  // nicht erst an — die sortiert `findAll` aus.
  const active = (people.data ?? []).filter(
    (person) => person.acceptedAt !== null,
  );
  const attending = active.filter((p) => statusOf(p.id) === 'ATTENDING');
  const unknown = active.filter((p) => statusOf(p.id) === 'UNKNOWN');
  const absent = active.filter((p) => statusOf(p.id) === 'ABSENT');

  // An einem vergangenen Abend zählt nur, wer da war: „geplant für" ist keine
  // Aussage über gestern.
  const planned = readOnly ? attending : [...attending, ...unknown];

  return (
    <>
      <section>
        <SectionTitle>
          {readOnly
            ? `Wer war da (${attending.length})`
            : `Geplant für ${planned.length} ${planned.length === 1 ? 'Person' : 'Personen'}`}
        </SectionTitle>

        <Card className={planned.length > 0 ? 'p-0' : undefined}>
          {planned.length === 0 ? (
            <p className="text-xs text-stone-400">
              {readOnly
                ? 'Niemand ist als anwesend eingetragen.'
                : 'Bisher hat niemand geantwortet.'}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {planned.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  status={statusOf(person.id)}
                  note={rowOf(person.id)?.note ?? null}
                  isMe={person.id === me.me?.id}
                />
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Eine eigene Gruppe und zugeklappt: Wer abgesagt hat, gehört nicht in
          die Planung — aber der Gastgeber will trotzdem nachsehen können, wer
          fehlt und warum. */}
      {absent.length > 0 && (
        <div className="rounded-lg border border-line">
          <button
            type="button"
            aria-expanded={showAbsent}
            onClick={() => setShowAbsent((open) => !open)}
            className="flex w-full items-center justify-between gap-3 p-3 text-left"
          >
            <span className="text-xs font-semibold text-stone-500">
              Abgesagt ({absent.length})
            </span>
            <ChevronDown
              size={16}
              className={cn(
                'shrink-0 text-stone-400 transition-transform',
                showAbsent && 'rotate-180',
              )}
            />
          </button>

          {showAbsent && (
            <ul className="divide-y divide-line border-t border-line">
              {absent.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  status="ABSENT"
                  note={rowOf(person.id)?.note ?? null}
                  isMe={person.id === me.me?.id}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function PersonRow({
  person,
  status,
  note,
  isMe,
}: {
  person: Person;
  status: AttendanceStatus;
  note: string | null;
  isMe: boolean;
}) {
  const answer = ANSWER[status];
  const NoteIcon = NOTE_FIELD[status].icon;

  return (
    // Ohne Notiz ist die Zeile eine Zeile, und dann sitzt der Name mittig neben
    // dem Bild. Die Ausrichtung nach oben samt der beiden Ausgleichs-Margen gilt
    // dem zweizeiligen Fall — ohne zweite Zeile war sie nur eine Leerfläche
    // unter dem Namen.
    <li
      className={cn(
        'flex gap-3 px-4 py-3',
        note ? 'items-start' : 'items-center',
      )}
    >
      <Avatar
        person={person}
        size="sm"
        className={cn('shrink-0', note && 'mt-0.5')}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-stone-800">
          {isMe ? 'Du' : person.name}
        </p>
        {note && (
          <p
            className={cn(
              'mt-0.5 flex items-start gap-1.5 text-xs leading-relaxed',
              // Die Verspätung sticht heraus, die anderen beiden nicht: Sie
              // ändert etwas am Abend selbst, während „muss schauen" und ein
              // Absagegrund nur erklären.
              status === 'ATTENDING' ? 'text-terracotta-600' : 'text-stone-500',
            )}
          >
            <NoteIcon size={13} className="mt-0.5 shrink-0" />
            <span className="min-w-0">{note}</span>
          </p>
        )}
      </div>

      <span
        className={cn(
          'flex shrink-0 items-center gap-1.5 text-[11px] font-semibold',
          note && 'mt-1',
          answer.text,
        )}
      >
        <span className={cn('size-1.5 rounded-full', answer.dot)} />
        {answer.short}
      </span>
    </li>
  );
}
