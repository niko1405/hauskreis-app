'use client';

/**
 * Der eigene Haken unter einem Actionstep — und nur der.
 *
 * Hier standen einmal „5 von 9 haben's geschafft" und die Gesichter derer, die
 * abgehakt hatten. Der Haken sagt jetzt nur noch etwas über einen selbst: Wie
 * es den anderen mit ihrem Vorsatz ging, erzählen sie am nächsten Abend. Die
 * Haken der anderen liefert der Server weiterhin mit, gezeigt werden sie nicht.
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
import { useMe, useSetActionstepDone } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
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
  const setDone = useSetActionstepDone(meetingId);

  const doneByMe = done.some((row) => row.person.id === me.me?.id);

  return (
    <div className="border-t border-line pt-4">
      <button
        type="button"
        aria-pressed={doneByMe}
        disabled={!me.me}
        onClick={() => setDone.mutate(!doneByMe)}
        className={cn(
          'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-50',
          'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
          doneByMe
            ? 'border-success-line bg-success-bg/40 text-success'
            : 'border-line text-stone-500 hover:border-line-strong',
        )}
      >
        {doneByMe ? <CheckCircle2 size={17} /> : <Circle size={17} />}
        <span className="text-sm font-bold">
          {doneByMe ? 'Du hast es geschafft' : 'Für mich abhaken'}
        </span>
      </button>
    </div>
  );
}
