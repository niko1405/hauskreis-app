'use client';

/**
 * Der eigene Haken unter einem Actionstep, plus die Gesichter der anderen.
 *
 * Namen statt nur einer Zahl: „5 von 9" sagt, wie es der Gruppe geht, die
 * Gesichter sagen, wen man fragen kann, wie es lief. Für neun Leute passt beides
 * nebeneinander.
 *
 * Der Haken hängt am **Termin** (`meeting_actionstep_done`), der Text an der
 * Einheit. Deshalb steht dieser Block an zwei Stellen: unter dem Actionstep im
 * Termin und unter demselben Actionstep auf der Themenseite. Zweimal derselbe
 * Vorsatz, zweimal derselbe Haken — und genau deshalb **eine** Komponente.
 *
 * Erst ab dem Termintag: einen Vorsatz für nächste Woche hakt man heute nicht
 * ab. Danach für immer — nachzutragen ist der Normalfall und nicht der
 * Fehlgriff. Die Entscheidung darüber trifft der Aufrufer, weil nur er weiß,
 * ob sein Abend schon war.
 */
import { CheckCircle2, Circle } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useMe, usePeople, useSetActionstepDone } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { actionstepProgress } from '@/lib/meeting';
import type { PersonRef } from '@/lib/api/types';

export function ActionstepCheck({
  meetingId,
  done,
}: {
  meetingId: string;
  /** Wer schon abgehakt hat — die eigene Person ist mit drin, wenn man selbst. */
  done: readonly { person: PersonRef }[];
}) {
  const me = useMe();
  const people = usePeople();
  const setDone = useSetActionstepDone(meetingId);

  const doneByMe = done.some((row) => row.person.id === me.me?.id);
  const activeCount = (people.data ?? []).length;
  const others = done
    .map((row) => row.person)
    .filter((person) => person.id !== me.me?.id);

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <button
        type="button"
        aria-pressed={doneByMe}
        disabled={!me.me}
        onClick={() => setDone.mutate(!doneByMe)}
        className={cn(
          'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-50',
          'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
          doneByMe
            ? 'border-music-line bg-music-bg/40 text-music'
            : 'border-line text-stone-500 hover:border-line-strong',
        )}
      >
        {doneByMe ? <CheckCircle2 size={17} /> : <Circle size={17} />}
        <span className="text-sm font-bold">
          {doneByMe ? 'Du hast es geschafft' : 'Für mich abhaken'}
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-stone-400">
          {actionstepProgress(done.length, activeCount)}
        </span>
        {others.length > 0 && (
          <span className="flex items-center gap-1.5">
            {others.map((person) => (
              <span key={person.id} title={person.name}>
                <Avatar person={person} size="xs" />
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
