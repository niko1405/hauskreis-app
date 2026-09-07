'use client';

/**
 * „Bist du dabei?" als drei Knöpfe — in der Terminliste und im Kalender.
 *
 * **Ein Schalter aus drei Feldern, nicht drei Knöpfe.** Sie standen einmal als
 * drei einzeln umrandete Pillen nebeneinander, und damit sah jede aus wie eine
 * eigene Handlung — dabei ist es *eine* Frage, von deren drei Antworten genau
 * eine gilt. Der Rahmen liegt deshalb außen herum; gefüllt ist nur die, die
 * gerade gewählt ist, die übrigen tragen keinen eigenen.
 *
 * **Warum das eine eigene Datei ist.** Der Kalender bekommt seine Antwort
 * zurück, und damit gäbe es die Knöpfe zweimal — an zwei Stellen, die
 * verschieden aussehen sollen und trotzdem dasselbe tun müssen. Was hier steht,
 * ist nur die Form; die Regel dahinter (die Rückfrage, wenn eine Rolle
 * dranhängt) wohnt weiter in `useAttendanceAnswer`.
 *
 * **Das Notizfeld gehört nicht dazu.** `AnswerNoteSheet` rendert sein Overlay
 * als `position: fixed` ohne Portal — es muss deshalb dort im Baum stehen, wo
 * kein Vorfahr einen eigenen Bezugsrahmen aufmacht (die Terminkarte trägt
 * `active:scale`). Diese Komponente meldet über `onAnswered` nur, dass etwas
 * geantwortet wurde; wo das Sheet hängt, entscheidet der Aufrufer.
 */
import { cn } from '@/lib/cn';
import { isMeetingPast } from '@/lib/meeting';
import { useMe } from '@/lib/api/hooks';
import type { AttendanceStatus, MeetingListItem } from '@/lib/api/types';
import { ANSWERS } from './attendance-answers';
import { useAttendanceAnswer } from './use-attendance-answer';

/**
 * Ob es an diesem Abend überhaupt etwas zu antworten gibt.
 *
 * An einem vergangenen oder abgesagten gibt es nichts mehr zuzusagen — dieselbe
 * Regel, mit der die Detailseite ihren Antwort-Balken zeigt. Sie steht hier,
 * damit Liste, Kalender und Karte nicht drei Meinungen darüber haben.
 */
export function isAnswerable(
  meeting: MeetingListItem,
  meId: string | undefined,
): boolean {
  return (
    meId !== undefined &&
    meeting.status !== 'CANCELLED' &&
    !isMeetingPast(meeting)
  );
}

export function AnswerButtons({
  meeting,
  compact = false,
  onAnswered,
}: {
  meeting: MeetingListItem;
  /**
   * Schmal genug für eine Zeile: Die Knöpfe nehmen nur den Platz, den sie
   * brauchen, und unter `sm` steht auf ihnen nur ihr Symbol.
   *
   * Für die Monatsliste im Kalender. Dort sitzt die Antwort **neben** dem
   * Termin und nicht darunter — eine zweite Zeile hätte die ohnehin schon
   * dreizeilige Kachel auf fünf gebracht. Auf dem Telefon bleibt vom Wort
   * „Weiß nicht" dann das Fragezeichen; was es bedeutet, sagt die
   * Sprachausgabe weiterhin über `aria-label`.
   */
  compact?: boolean;
  /** Ist wirklich geantwortet worden — die Rückfrage kann abgebrochen werden. */
  onAnswered: (status: AttendanceStatus) => void;
}) {
  const { me } = useMe();
  const { answer } = useAttendanceAnswer(meeting);

  const myStatus =
    meeting.attendances.find((row) => row.personId === me?.id)?.status ??
    'UNKNOWN';

  const choose = async (
    event: React.MouseEvent,
    next: AttendanceStatus,
  ): Promise<void> => {
    // Beide Aufrufer sitzen in oder neben einem `<Link>`. Ohne beides führt
    // jeder Tipp zusätzlich auf die Detailseite — und die Antwort wäre nicht
    // mehr zu sehen.
    event.preventDefault();
    event.stopPropagation();
    if (await answer(next)) onAnswered(next);
  };

  return (
    <div
      className={cn(
        'flex gap-1 rounded-xl border border-line bg-canvas p-1',
        compact && 'shrink-0',
      )}
    >
      {ANSWERS.map((option) => {
        const Icon = option.icon;
        const chosen = myStatus === option.status;

        return (
          <button
            key={option.status}
            type="button"
            aria-pressed={chosen}
            aria-label={option.label}
            onClick={(event) => void choose(event, option.status)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg border py-2',
              'text-[11px] font-bold transition-colors',
              'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
              compact ? 'px-2.5' : 'flex-1 px-2',
              chosen
                ? option.active
                : 'border-transparent text-stone-400 hover:text-stone-600',
            )}
          >
            <Icon size={13} className="shrink-0" />
            <span className={cn(compact && 'hidden sm:inline')}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
