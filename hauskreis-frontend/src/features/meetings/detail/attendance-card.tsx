'use client';

/**
 * Wer kommt — und was die Einzelnen dazu zu sagen haben.
 *
 * **„Weiß noch nicht" zählt mit.** Oben stehen Zusagen und Unentschiedene
 * zusammen: Der Server plant mit derselben Menge (`countExpectedAttendance`,
 * alle außer den Absagen), und als Gastgeber plant man lieber mit einem zu
 * viel als mit einem zu wenig. Die Abgesagten stehen für sich, zugeklappt,
 * weil sie eine andere Frage beantworten.
 *
 * **Am vergangenen Abend** steht oben, wer da war, und zugeklappt darunter
 * „War nicht da" — wer abgesagt hatte und wer unsicher war oder nie
 * geantwortet hat. Jede Zeile trägt dort ihren eigenen Status.
 *
 * **Der eine Satz zur Antwort** hängt an der Anwesenheitszeile (`note`), gilt
 * für alle drei Status und wechselt nur seine Beschriftung. Eine Verspätung
 * steht daneben als eigene Zeile (`lateMinutes`).
 *
 * Die eigene Antwort steht unten am Bildschirm (`answer-bar.tsx`); Farben,
 * Kurzformen und Symbole teilen sich beide über
 * `domain/attendance-answers.ts`.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Card, SectionTitle } from '@/components/ui/card';
import { useMe, usePeople } from '@/lib/api/hooks';
import {
  ANSWER,
  LATE_ICON,
  NOTE_FIELD,
  lateLabel,
} from '@/components/domain/attendance-answers';
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
  const [showAway, setShowAway] = useState(false);

  const rowOf = (personId: string) =>
    meeting.attendances.find((entry) => entry.personId === personId);
  const statusOf = (personId: string): AttendanceStatus =>
    rowOf(personId)?.status ?? 'UNKNOWN';

  // Eingeladene zählen nicht mit: Wer sich noch nie angemeldet hat, kann nicht
  // antworten und stünde auf ewig unter „weiß noch nicht". Der Server rechnet
  // für „alle haben abgesagt" mit derselben Menge, die Terminkarte ebenso
  // (`attendanceCounts` in `lib/meeting.ts`); hier werden neben der Zahl auch
  // die Namen gebraucht.
  const active = (people.data ?? []).filter(
    (person) => person.acceptedAt !== null,
  );
  const attending = active.filter((p) => statusOf(p.id) === 'ATTENDING');
  const unknown = active.filter((p) => statusOf(p.id) === 'UNKNOWN');
  const absent = active.filter((p) => statusOf(p.id) === 'ABSENT');

  // An einem vergangenen Abend zählt oben nur, wer da war: „geplant für" ist
  // keine Aussage über gestern. Wer abgesagt hatte und wer unsicher war, steht
  // dann gemeinsam unter „War nicht da".
  const planned = readOnly ? attending : [...attending, ...unknown];
  const away = readOnly ? [...absent, ...unknown] : absent;

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
                  lateMinutes={rowOf(person.id)?.lateMinutes ?? null}
                  isMe={person.id === me.me?.id}
                />
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Eine eigene Gruppe und zugeklappt: Wer fehlt, gehört nicht in die
          Planung — aber der Gastgeber will trotzdem nachsehen können, wer
          fehlt und warum. */}
      {away.length > 0 && (
        <div className="rounded-lg border border-line">
          <button
            type="button"
            aria-expanded={showAway}
            onClick={() => setShowAway((open) => !open)}
            className="flex w-full items-center justify-between gap-3 p-3 text-left"
          >
            <span className="text-xs font-semibold text-stone-500">
              {readOnly ? 'War nicht da' : 'Abgesagt'} ({away.length})
            </span>
            <ChevronDown
              size={16}
              className={cn(
                'shrink-0 text-stone-400 transition-transform',
                showAway && 'rotate-180',
              )}
            />
          </button>

          {showAway && (
            <ul className="divide-y divide-line border-t border-line">
              {away.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  status={statusOf(person.id)}
                  note={rowOf(person.id)?.note ?? null}
                  lateMinutes={null}
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
  lateMinutes,
  isMe,
}: {
  person: Person;
  status: AttendanceStatus;
  note: string | null;
  lateMinutes: number | null;
  isMe: boolean;
}) {
  const answer = ANSWER[status];
  const NoteIcon = NOTE_FIELD[status].icon;
  const late = status === 'ATTENDING' ? lateMinutes : null;
  const twoLines = Boolean(note) || late !== null;

  return (
    // Ohne zweite Zeile sitzt der Name mittig neben dem Bild; die Ausrichtung
    // nach oben samt der Ausgleichs-Margen gilt nur dem mehrzeiligen Fall.
    <li
      className={cn(
        'flex gap-3 px-4 py-3',
        twoLines ? 'items-start' : 'items-center',
      )}
    >
      <Avatar
        person={person}
        size="sm"
        className={cn('shrink-0', twoLines && 'mt-0.5')}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-stone-800">
          {isMe ? 'Du' : person.name}
        </p>
        {/* Die Verspätung sticht heraus, der Satz nicht: Sie ändert etwas am
            Abend selbst, ein Satz erklärt nur. */}
        {late !== null && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-terracotta-600">
            <LATE_ICON size={13} className="shrink-0" />
            {lateLabel(late)}
          </p>
        )}
        {note && (
          <p className="mt-0.5 flex items-start gap-1.5 text-xs leading-relaxed text-stone-500">
            <NoteIcon size={13} className="mt-0.5 shrink-0" />
            <span className="min-w-0">{note}</span>
          </p>
        )}
      </div>

      <span
        className={cn(
          'flex shrink-0 items-center gap-1.5 text-[11px] font-semibold',
          twoLines && 'mt-1',
          answer.text,
        )}
      >
        <span className={cn('size-1.5 rounded-full', answer.dot)} />
        {answer.short}
      </span>
    </li>
  );
}
