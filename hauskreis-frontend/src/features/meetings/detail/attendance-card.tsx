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
 * geantwortet hat. Rechts steht dort nur ein Punkt, grün oder rot: Ob jemand
 * damals „unsicher" war, ist keine Auskunft über gestern, und die Gruppe sagt
 * schon, auf welcher Seite er steht.
 *
 * **Die eigene Anwesenheit lässt sich nachtragen** — im Bearbeitungsmodus,
 * mit „Warst du dabei?". Nur Ja oder Nein: „Unsicher" gibt es über einen
 * vergangenen Abend nicht, und ein Satz dazu wäre Planung, die vorbei ist.
 *
 * **Der eine Satz zur Antwort** hängt an der Anwesenheitszeile (`note`), gilt
 * für alle drei Status und wechselt nur seine Beschriftung. Eine Verspätung
 * steht daneben als eigene Zeile (`lateMinutes`).
 *
 * **Der Satz steht als Sprechblase unter dem Namen**, wie ein Gebetsanliegen:
 * Es ist etwas, das jemand der Gruppe sagt, und als graue Zeile mit Symbol
 * davor las er sich wie ein Datenfeld. Die Verspätung bleibt eine Zeile in
 * Terracotta darüber — sie ändert etwas am Abend, der Satz erklärt nur.
 *
 * Die eigene Antwort steht unten am Bildschirm (`answer-bar.tsx`, dort weiter
 * knapp mit Symbol über `AnswerNote`); Farben, Kurzformen und Symbole teilen
 * sich beide über `domain/attendance-answers.ts`.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Card, SectionTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { SpeechBubble } from '@/components/ui/speech-bubble';
import { useMe, usePeople, useSetAttendance } from '@/lib/api/hooks';
import {
  ANSWER,
  LATE_ICON,
  lateLabel,
} from '@/components/domain/attendance-answers';
import { cn } from '@/lib/cn';
import type { AttendanceStatus, Meeting, Person } from '@/lib/api/types';

/** Was rechts in einer Zeile steht: der Status, oder am vergangenen Abend ein Punkt. */
type Marker = 'status' | 'present' | 'away';

export function AttendanceCard({
  meeting,
  readOnly = false,
  editSelf = false,
}: {
  meeting: Meeting;
  /** Ein vergangener oder abgesagter Abend: daran ändert niemand mehr etwas. */
  readOnly?: boolean;
  /** Am vergangenen Abend im Bearbeitungsmodus: die eigene Anwesenheit nachtragen. */
  editSelf?: boolean;
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
      {editSelf && me.me && (
        <SelfAttendance
          meetingId={meeting.id}
          personId={me.me.id}
          status={statusOf(me.me.id)}
        />
      )}

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
                  marker={readOnly ? 'present' : 'status'}
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
                  marker={readOnly ? 'away' : 'status'}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

/**
 * „Warst du dabei?" — nachtragen, wie es war.
 *
 * Direkt über `useSetAttendance` und nicht über den Antwort-Hook: Der fragt
 * vor einer Absage, ob die eigenen Rollen frei werden sollen, und an einem
 * vergangenen Abend wird nichts frei (der Server prüft das selbst). Es geht
 * auch keine Nachricht raus. Steht man auf „weiß nicht", ist keines gewählt.
 */
function SelfAttendance({
  meetingId,
  personId,
  status,
}: {
  meetingId: string;
  personId: string;
  status: AttendanceStatus;
}) {
  const setAttendance = useSetAttendance(meetingId);

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-bold text-stone-800">Warst du dabei?</p>
      <Segmented<AttendanceStatus>
        size="sm"
        label="Warst du dabei?"
        value={status}
        onChange={(next) => {
          if (next !== status) setAttendance.mutate({ personId, status: next });
        }}
        options={[
          { value: 'ABSENT', label: 'Nein' },
          { value: 'ATTENDING', label: 'Ja' },
        ]}
      />
    </Card>
  );
}

function PersonRow({
  person,
  status,
  note,
  lateMinutes,
  isMe,
  marker,
}: {
  person: Person;
  status: AttendanceStatus;
  note: string | null;
  lateMinutes: number | null;
  isMe: boolean;
  marker: Marker;
}) {
  const answer = ANSWER[status];
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
        {late !== null && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-terracotta-600">
            <LATE_ICON size={13} className="shrink-0" />
            {lateLabel(late)}
          </p>
        )}
        {/* Der Abstand außen, nicht an der Blase: Der Zipfel hängt an ihrem
            äußeren Rahmen und braucht über ihr Platz. */}
        {note && (
          <div className="mt-2">
            <SpeechBubble tail="top" size="sm">
              <p className="text-xs leading-relaxed break-words whitespace-pre-line text-stone-600">
                {note}
              </p>
            </SpeechBubble>
          </div>
        )}
      </div>

      {marker === 'status' ? (
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
      ) : (
        // Am vergangenen Abend nur ein Punkt: Die Gruppe darüber sagt schon,
        // auf welcher Seite jemand steht, und „unsicher" ist über gestern
        // keine Auskunft.
        <span
          className={cn(
            'size-2 shrink-0 rounded-full',
            twoLines && 'mt-2',
            marker === 'present' ? 'bg-success' : 'bg-alert',
          )}
        >
          <span className="sr-only">
            {marker === 'present' ? 'war da' : 'war nicht da'}
          </span>
        </span>
      )}
    </li>
  );
}
