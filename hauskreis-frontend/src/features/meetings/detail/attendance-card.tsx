'use client';

/**
 * Wer kommt. Anders als im Entwurf lässt sich das für **alle** eintragen —
 * in der Praxis sagt jemand im Gespräch ab, und dann trägt es ein, wer gerade
 * die App offen hat.
 */
import { Avatar } from '@/components/ui/avatar';
import { Card, SectionTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import { useMe, usePeople, useSetAttendance } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import type { AttendanceStatus, Meeting } from '@/lib/api/types';

const NEXT_STATUS: Record<AttendanceStatus, AttendanceStatus> = {
  UNKNOWN: 'ATTENDING',
  ATTENDING: 'ABSENT',
  ABSENT: 'UNKNOWN',
};

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

export function AttendanceCard({ meeting }: { meeting: Meeting }) {
  const people = usePeople();
  const me = useMe();
  const setAttendance = useSetAttendance(meeting.id);
  const toast = useToast();

  const statusOf = (personId: string): AttendanceStatus =>
    meeting.attendances.find((a) => a.personId === personId)?.status ??
    'UNKNOWN';

  const attending = meeting.attendances.filter(
    (a) => a.status === 'ATTENDING',
  ).length;

  return (
    <section>
      <SectionTitle>
        Wer kommt ({attending} von {people.data?.length ?? 0})
      </SectionTitle>
      <Card>
        <ul className="grid grid-cols-2 gap-2">
          {(people.data ?? []).map((person) => {
            const status = statusOf(person.id);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  disabled={setAttendance.isPending}
                  onClick={() =>
                    setAttendance.mutate(
                      { personId: person.id, status: NEXT_STATUS[status] },
                      { onError: (error) => toast.error(errorMessage(error)) },
                    )
                  }
                  aria-label={`${person.name}: ${STATUS_LABEL[status]} — antippen zum Ändern`}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border p-2 text-left transition-colors disabled:opacity-60',
                    STATUS_STYLE[status],
                  )}
                >
                  <Avatar person={person} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {person.id === me.me?.id ? 'Du' : person.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11px] text-stone-400">
          Antippen wechselt zwischen dabei, nicht dabei und unklar.
        </p>
      </Card>
    </section>
  );
}
