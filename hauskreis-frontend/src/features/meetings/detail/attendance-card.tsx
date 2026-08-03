'use client';

/**
 * Wer kommt — eine Liste, kein Bedienfeld.
 *
 * Vorher ließ sich hier für **jede** Person durchtippen. Das las sich wie eine
 * Anwesenheitskontrolle, die jede:r für jede:n führt, und ein Fehlgriff sagte
 * wildfremd ab. Jetzt steht die Liste einfach da.
 *
 * Die eigene Antwort ist deshalb nicht verschwunden, sondern eine eigene Zeile
 * darunter. Ohne die gäbe es für einen Abend in drei Wochen gar keinen Weg,
 * zuzusagen: „Bist du dabei?" auf dem Home-Screen gilt nur fürs nächste
 * Treffen, und Abwesenheiten im Profil decken Zeiträume ab, keine einzelnen
 * Abende.
 */
import { Avatar } from '@/components/ui/avatar';
import { Card, SectionTitle } from '@/components/ui/card';
import { useMe, usePeople, useSetAttendance } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import type { AttendanceStatus, Meeting } from '@/lib/api/types';

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  ATTENDING: 'border-music-line bg-music-bg text-music',
  ABSENT: 'border-alert-line bg-alert-bg text-alert line-through',
  UNKNOWN: 'border-line bg-card text-stone-400',
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  ATTENDING: 'dabei',
  ABSENT: 'nicht dabei',
  UNKNOWN: 'unklar',
};

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
  /** Ein vergangener Abend: wer da war, war da. */
  readOnly?: boolean;
}) {
  const people = usePeople();
  const me = useMe();
  const setAttendance = useSetAttendance(meeting.id);

  const statusOf = (personId: string): AttendanceStatus =>
    meeting.attendances.find((a) => a.personId === personId)?.status ??
    'UNKNOWN';

  const attending = meeting.attendances.filter(
    (a) => a.status === 'ATTENDING',
  ).length;

  const myStatus = me.me ? statusOf(me.me.id) : 'UNKNOWN';

  return (
    <section>
      <SectionTitle>
        {readOnly ? 'Wer war da' : 'Wer kommt'} ({attending} von{' '}
        {people.data?.length ?? 0})
      </SectionTitle>
      <Card className="space-y-4">
        <ul className="grid grid-cols-2 gap-2">
          {(people.data ?? []).map((person) => {
            const status = statusOf(person.id);
            return (
              <li
                key={person.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border p-2',
                  STATUS_STYLE[status],
                )}
              >
                <Avatar person={person} size="xs" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {person.id === me.me?.id ? 'Du' : person.name}
                </span>
                <span className="sr-only">{STATUS_LABEL[status]}</span>
              </li>
            );
          })}
        </ul>

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
                    'flex-1 rounded-full border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60',
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
