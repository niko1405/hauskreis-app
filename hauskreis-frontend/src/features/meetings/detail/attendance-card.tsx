'use client';

/**
 * Wer kommt — und nur, wer kommt.
 *
 * Vorher standen hier alle neun Kacheln nebeneinander, Zusagen, Absagen und
 * Schweigen gleich groß. Das beantwortet die Frage nicht, die man an diese
 * Karte hat: „mit wie vielen rechne ich?" Jetzt zeigt das Raster die Zusagen,
 * und alles andere steht als ruhige Zeile darunter — der Gastgeber muss wissen,
 * wer abgesagt hat, aber nicht als gleichwertige Kachel.
 *
 * Die eigene Antwort ist eine eigene Zeile ganz unten. Sie ist der Weg, für
 * einen einzelnen Abend abzusagen: „Bist du dabei?" auf dem Home-Screen gilt
 * nur fürs nächste Treffen, Abwesenheiten im Profil decken Zeiträume ab, und
 * den **ganzen** Abend abzusagen ist Admin-Sache und etwas völlig anderes.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Card, SectionTitle } from '@/components/ui/card';
import { useMe, usePeople, useSetAttendance } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import type { AttendanceStatus, Meeting, Person } from '@/lib/api/types';

const OWN_ANSWERS: { status: AttendanceStatus; label: string }[] = [
  { status: 'ATTENDING', label: 'Dabei' },
  { status: 'ABSENT', label: 'Nicht dabei' },
  { status: 'UNKNOWN', label: 'Weiß noch nicht' },
];

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
  const setAttendance = useSetAttendance(meeting.id);
  const [showRest, setShowRest] = useState(false);

  const statusOf = (personId: string): AttendanceStatus =>
    meeting.attendances.find((a) => a.personId === personId)?.status ??
    'UNKNOWN';

  // Inaktive Personen zählen nirgends mit — vorher stand im Nenner schlicht
  // die Länge der ganzen Liste.
  const active = (people.data ?? []).filter((person) => person.active);
  const attending = active.filter((p) => statusOf(p.id) === 'ATTENDING');
  const absent = active.filter((p) => statusOf(p.id) === 'ABSENT');
  const unanswered = active.filter((p) => statusOf(p.id) === 'UNKNOWN');

  const myStatus = me.me ? statusOf(me.me.id) : 'UNKNOWN';

  return (
    <section>
      <SectionTitle>
        {readOnly ? 'Wer war da' : 'Wer kommt'} ({attending.length} von{' '}
        {active.length})
      </SectionTitle>
      <Card className="space-y-4">
        {attending.length === 0 ? (
          <p className="text-xs text-stone-400">
            {readOnly
              ? 'Niemand ist als anwesend eingetragen.'
              : 'Noch hat niemand zugesagt.'}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {attending.map((person) => (
              <li
                key={person.id}
                className="flex items-center gap-2 rounded-md border border-music-line bg-music-bg p-2 text-music"
              >
                <Avatar person={person} size="xs" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {person.id === me.me?.id ? 'Du' : person.name}
                </span>
              </li>
            ))}
          </ul>
        )}

        {(absent.length > 0 || unanswered.length > 0) && (
          <div className="border-t border-line pt-3">
            <button
              type="button"
              aria-expanded={showRest}
              onClick={() => setShowRest((open) => !open)}
              className="flex w-full items-center gap-1.5 text-left text-[11px] text-stone-400 hover:text-stone-500"
            >
              <span className="flex-1">
                {[
                  absent.length > 0 && `${absent.length} abgesagt`,
                  unanswered.length > 0 && `${unanswered.length} ohne Antwort`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <ChevronDown
                size={13}
                className={cn(
                  'shrink-0 transition-transform',
                  showRest && 'rotate-180',
                )}
              />
            </button>

            {showRest && (
              <div className="mt-2 space-y-2">
                <NameRow label="Abgesagt" people={absent} meId={me.me?.id} />
                <NameRow
                  label="Noch keine Antwort"
                  people={unanswered}
                  meId={me.me?.id}
                />
              </div>
            )}
          </div>
        )}

        {!readOnly && me.me && (
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-[11px] font-semibold text-stone-500">
              Deine Antwort
            </p>
            <div className="flex gap-2">
              {OWN_ANSWERS.map((answer) => (
                <button
                  key={answer.status}
                  type="button"
                  aria-pressed={myStatus === answer.status}
                  onClick={() =>
                    setAttendance.mutate({
                      personId: me.me!.id,
                      status: answer.status,
                    })
                  }
                  className={cn(
                    'flex-1 rounded-full border px-3 py-2 text-xs font-semibold transition-colors',
                    myStatus === answer.status
                      ? 'border-terracotta-500 bg-terracotta-500 text-white'
                      : 'border-line bg-card text-stone-500 hover:border-terracotta-400',
                  )}
                >
                  {answer.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function NameRow({
  label,
  people,
  meId,
}: {
  label: string;
  people: Person[];
  meId: string | undefined;
}) {
  if (people.length === 0) return null;

  return (
    <p className="text-[11px] leading-relaxed text-stone-400">
      <span className="font-semibold text-stone-500">{label}: </span>
      {people
        .map((person) => (person.id === meId ? 'Du' : person.name))
        .join(', ')}
    </p>
  );
}
