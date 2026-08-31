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
 * **„Weiß noch nicht" gibt die eigenen Rollen dieses Abends frei** — deshalb
 * läuft der Statuswechsel über `useAttendanceAnswer` und nicht direkt über
 * `useSetAttendance`. Der Hook fragt vorher nach, und zwar nur, wenn wirklich
 * etwas dranhängt.
 */
import { useState } from 'react';
import { ChevronDown, Clock, HelpCircle, MessageSquare } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { TextArea } from '@/components/ui/field';
import { useMe, usePeople, useSetAttendance } from '@/lib/api/hooks';
import { useAttendanceAnswer } from '@/components/domain/use-attendance-answer';
import { cn } from '@/lib/cn';
import type { AttendanceStatus, Meeting, Person } from '@/lib/api/types';

/**
 * Wie die drei Antworten heißen und aussehen.
 *
 * Der aktive Knopf färbt sich **nach seiner Bedeutung** und nicht einheitlich
 * terracotta: „dabei" ist die gute Nachricht, „nicht dabei" die, die dem
 * Gastgeber etwas wegnimmt, „weiß noch nicht" die offene. Drei gleich getönte
 * Knöpfe hätten das eingeebnet.
 */
const ANSWERS: {
  status: AttendanceStatus;
  label: string;
  short: string;
  active: string;
  dot: string;
  text: string;
}[] = [
  {
    status: 'ATTENDING',
    label: 'Dabei',
    short: 'Dabei',
    active: 'border-music-line bg-music-bg text-music',
    dot: 'bg-music',
    text: 'text-music',
  },
  {
    status: 'ABSENT',
    label: 'Nicht dabei',
    short: 'Abgesagt',
    active: 'border-alert-line bg-alert-bg text-alert',
    dot: 'bg-alert',
    text: 'text-alert',
  },
  {
    status: 'UNKNOWN',
    label: 'Weiß noch nicht',
    short: 'Unsicher',
    active: 'border-terracotta-100 bg-terracotta-50 text-terracotta-700',
    dot: 'bg-topic',
    text: 'text-topic',
  },
];

const ANSWER = Object.fromEntries(
  ANSWERS.map((answer) => [answer.status, answer]),
) as Record<AttendanceStatus, (typeof ANSWERS)[number]>;

/** Beschriftung und Beispiel je Status — dieselbe Spalte, andere Frage. */
const NOTE_FIELD: Record<
  AttendanceStatus,
  { label: string; placeholder: string; icon: typeof Clock }
> = {
  ATTENDING: {
    label: 'Verspätung oder Info (optional)',
    placeholder: 'z.B. Komme 20 Min später…',
    icon: Clock,
  },
  UNKNOWN: {
    label: "Woran liegt's? (hilft bei der Planung)",
    placeholder: 'z.B. Muss schauen, wann Feierabend ist…',
    icon: HelpCircle,
  },
  ABSENT: {
    label: 'Grund (optional)',
    placeholder: 'z.B. Bin im Urlaub, euch viel Spaß!',
    icon: MessageSquare,
  },
};

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

      {!readOnly && me.me && (
        <OwnAnswer
          meeting={meeting}
          status={statusOf(me.me.id)}
          note={rowOf(me.me.id)?.note ?? null}
        />
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

/**
 * Die eigene Antwort.
 *
 * **Der Status schreibt sofort, die Notiz auf Knopfdruck.** Ein Tipp auf
 * „Dabei" ist überall sonst in der App — Startbildschirm, Terminkarte,
 * Kalender — sofort verbindlich; hier erst nach einem zweiten Knopf zu
 * speichern hieße, dass man nach dem Antippen weggehen und nichts gesagt haben
 * kann. Die Notiz braucht den Knopf dagegen: Sonst ginge bei jedem Buchstaben
 * eine Anfrage raus.
 */
function OwnAnswer({
  meeting,
  status,
  note,
}: {
  meeting: Meeting;
  status: AttendanceStatus;
  note: string | null;
}) {
  // Der Status läuft über den gemeinsamen Hook: Auf „Weiß noch nicht" zu gehen
  // gibt die eigenen Rollen dieses Abends frei, und danach wird gefragt. Die
  // **Notiz** geht direkt raus — sie ändert am Status nichts und braucht
  // deshalb auch keine Rückfrage.
  const { answer } = useAttendanceAnswer(meeting);
  const setAttendance = useSetAttendance(meeting.id);
  const me = useMe();
  const personId = me.me?.id;
  const [draft, setDraft] = useState(note ?? '');
  // Der Entwurf folgt dem Server, solange niemand tippt — sonst stünde nach
  // einem Statuswechsel (der die Notiz löscht) der alte Satz noch im Feld.
  const [touched, setTouched] = useState(false);
  const shown = touched ? draft : (note ?? '');

  const field = NOTE_FIELD[status];
  const FieldIcon = field.icon;
  const trimmed = shown.trim();
  const changed = (trimmed === '' ? null : trimmed) !== note;

  return (
    <section>
      <SectionTitle>Deine Antwort</SectionTitle>
      <Card className="space-y-3">
        <div className="flex gap-2">
          {ANSWERS.map((option) => (
            <button
              key={option.status}
              type="button"
              aria-pressed={status === option.status}
              onClick={() => {
                setTouched(false);
                void answer(option.status);
              }}
              className={cn(
                'flex-1 rounded-md border px-2 py-2.5 text-xs font-bold transition-colors',
                status === option.status
                  ? option.active
                  : 'border-line bg-card text-stone-500 hover:border-line-strong',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 rounded-md border border-line bg-canvas p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
            <FieldIcon size={13} className="text-stone-400" />
            {field.label}
          </p>
          <TextArea
            value={shown}
            placeholder={field.placeholder}
            aria-label={field.label}
            className="min-h-16 bg-card"
            onChange={(event) => {
              setTouched(true);
              setDraft(event.target.value);
            }}
          />
          <div className="flex justify-end">
            {/* Immer da, aber nur bedienbar, wenn es etwas zu speichern gibt.
                Ihn verschwinden zu lassen hieße, die Karte springen zu
                lassen, sobald jemand den ersten Buchstaben tippt. */}
            <Button
              size="sm"
              disabled={!changed}
              loading={setAttendance.isPending}
              onClick={() => {
                if (!personId) return;
                setTouched(false);
                setAttendance.mutate({
                  personId,
                  status,
                  note: trimmed === '' ? null : trimmed,
                });
              }}
            >
              Antwort speichern
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
