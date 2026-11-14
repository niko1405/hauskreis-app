'use client';

/**
 * Eine Terminkarte in der Liste. Zeigt, was man beim Überfliegen braucht:
 * wann, was, wo, wer — und was noch offen ist.
 */
import { Users } from 'lucide-react';
import Link from '@/components/ui/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { PRESSABLE } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatDayRange, formatRelativeDay } from '@/lib/date';
import { attendanceCounts, meetingHeadline, meetingPhase } from '@/lib/meeting';
import { useMe, usePeople } from '@/lib/api/hooks';
import type { AttendanceStatus, MeetingListItem } from '@/lib/api/types';
import { AnswerNoteSheet } from './answer-note-sheet';
import { AnswerButtons, isAnswerable } from './answer-buttons';
import { DateBox, TimeAndPlace } from './date-box';
import { RoleChip } from './role-badge';

export function MeetingCard({
  meeting,
  onPrefetch,
}: {
  meeting: MeetingListItem;
  onPrefetch?: (meetingId: string) => void;
}) {
  const { me } = useMe();
  // Eine Abfrage für die ganze Liste, nicht eine je Karte: `usePeople` liegt
  // mit `STALE.reference` im Cache und wird auf diesem Bildschirm ohnehin
  // gebraucht, sobald jemand ins Register „Planung" wechselt.
  const people = usePeople();
  /** Welche Antwort gerade nach einem Satz fragt — `null` heißt: keine. */
  const [noteFor, setNoteFor] = useState<AttendanceStatus | null>(null);

  const cancelled = meeting.status === 'CANCELLED';
  const phase = meetingPhase(meeting);
  const past = phase === 'past';
  // Abgesagt läuft nichts — auch wenn die Uhr es sagen würde.
  const running = phase === 'running' && !cancelled;
  // Abgesagt ist nichts mehr besonders — der Abend steht gedämpft da.
  const special = meeting.special && !cancelled;
  const counts = attendanceCounts(people.data ?? [], meeting.attendances);
  // An einem kommenden Abend die Menge, mit der geplant wird (Zusagen plus
  // Unentschiedene); an einem vergangenen oder abgesagten nur, wer da war.
  // Dieselbe Unterscheidung wie auf der Detailseite: „geplant für" ist keine
  // Aussage über gestern.
  const shown = past || cancelled ? counts.attending : counts.planned;
  const topicPeople = meeting.topicResponsibles.map((r) => r.person);
  const hasChips =
    meeting.hasTopicSlot ||
    meeting.hasTestimonySlot ||
    meeting.hasSongSlot ||
    meeting.hasSnackSlot;

  const myRow = meeting.attendances.find((row) => row.personId === me?.id);
  const answerable = isAnswerable(meeting, me?.id);

  return (
    <>
      <Link
        href={`/termin?id=${meeting.id}`}
        onMouseEnter={() => onPrefetch?.(meeting.id)}
        onTouchStart={() => onPrefetch?.(meeting.id)}
        className={cn(
          'block rounded-card border p-5 shadow-sm',
          PRESSABLE,
          'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
          // Kein eigener Ton für den Lobpreisabend: Was für ein Abend das ist,
          // sagen die Überschrift und die Chips darunter — und eine getönte
          // Karte in einer Liste sähe aus, als sei sie hervorgehoben.
          'bg-card',
          // **Ein besonderer Termin trägt einen goldenen Rahmen** und ein
          // goldenes Datums-Kästchen — statt eines Labels „Besonders" über dem
          // Titel. Auffallen soll er beim Überfliegen, aber ohne Tönung der
          // Fläche: Grün heißt „läuft", und eine getönte Karte sähe aus wie
          // eine Auswahl. Der Rahmen sagt es mit der Form, die die Karte
          // ohnehin hat.
          special ? 'border-special-line' : 'border-line',
          // Derselbe Rand wie „Aktueller Termin" auf „Heute": Grün ist die
          // Farbe von „gilt gerade". In einer Liste über Wochen ist der Abend,
          // an dem man sitzt, der eine, den man sofort finden will. **Nur der
          // Rand und das Abzeichen**, nicht die Fläche: Eine getönte Karte sah
          // aus wie eine Auswahl.
          running && 'border-success-line',
          cancelled && 'opacity-60',
        )}
      >
        <div className="flex items-start gap-3">
          {/* **Das Datum als Kästchen** — der Anker links, an dem das Auge die
              Liste heruntergeht: Nach dem Datum durchsucht man sie.

              Ein Zeitraum bekommt keins: „14.–16." passt nicht in ein Kästchen,
              und eine Freizeit ist kein Tag. Dort steht die Spanne als Zeile
              über dem Titel. */}
          {meeting.endDate === null && (
            <DateBox
              day={meeting.date}
              tone={special ? 'special' : 'default'}
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {/* Ein Zeitraum steht als einer da: „14. – 16. August" ist ein
                    Termin, keine Reihe aus dreien — und er hat kein Kästchen. */}
                {meeting.endDate && (
                  <span
                    className={cn(
                      'text-[10px] font-bold tracking-widest uppercase',
                      special ? 'text-special' : 'text-terracotta-500',
                    )}
                  >
                    {formatDayRange(meeting.date, meeting.endDate)}
                  </span>
                )}
                {!past && (
                  <span className="text-[10px] font-semibold text-stone-400">
                    {formatRelativeDay(meeting.date)}
                  </span>
                )}
                {running && <Badge variant="success">Läuft</Badge>}
                {cancelled && <Badge variant="alert">Abgesagt</Badge>}
              </div>

              {/* Die Zahl sagt **dasselbe wie die Detailseite**: Zusagen plus
                  Unentschiedene, also die Menge, mit der auch der Server
                  rechnet — als Gastgeber plant man mit der größeren.

                  Anders als die Antwort-Knöpfe steht sie auch an vergangenen
                  und abgesagten Abenden — dort aber als „wer war da", denn
                  „geplant für" ist keine Aussage über gestern. */}
              {shown > 0 && (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-bold text-stone-600">
                  <Users size={13} className="text-terracotta-500" />
                  {shown} {past || cancelled ? 'dabei' : 'geplant'}
                </span>
              )}
            </div>

            <h3 className="mt-1 truncate font-serif text-xl font-bold text-stone-900">
              {meetingHeadline(meeting)}
            </h3>

            {/* Der Tag ist die Sortierung, die Uhrzeit die Verabredung — und
                weil sie sich einstellen lässt, ist „18 Uhr wie immer" keine
                sichere Annahme.

                Die Art des Abends steht hier nicht, auch nicht bei eigenem
                Titel: Was der Abend hat, sagen die Chips darunter, und wer ihm
                einen Namen gibt, hat damit schon gesagt, was er ist. */}
            <TimeAndPlace
              startTime={meeting.startTime}
              location={meeting.location}
              host={meeting.host}
            />
          </div>
        </div>

        {/* **Untereinander, in jeder Breite**: Neben den Rollen-Chips läse sich
            die Antwort wie ein weiterer Chip.

            **Ohne Trennstriche**: Die Karte hat schon einen Rahmen, und was
            Striche sagen sollten, sagen die Formen — Chips sind Pillen mit
            Namen darin, die Antwort ein umrandeter Schalter. Getrennt wird über
            den Abstand. */}
        {/* **Kein Gastgeber-Chip**: Wer einlädt, steht schon in der Zeile
            darüber, mit einem Haus statt der Stecknadel — derselbe Mensch
            stand sonst zweimal auf der Karte. Ohne weitere Rolle fällt die
            Reihe deshalb ganz weg, statt als leerer Abstand stehen zu bleiben. */}
        {hasChips && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {meeting.hasTopicSlot && (
              <RoleChip kind="TOPIC" people={topicPeople} />
            )}
            {/* Und das Testimony, das an derselben Stelle des Abends steht — es
              fehlte hier wie die Musik davor. Auf einem Lobpreisabend zeigte
              die Karte damit Gastgeber und Musik, aber nicht, wer erzählt. */}
            {meeting.hasTestimonySlot && (
              <RoleChip
                kind="TESTIMONY"
                people={
                  meeting.testimonyPerson ? [meeting.testimonyPerson] : []
                }
              />
            )}
            {/* Musik fehlte hier, obwohl sie eine der drei Rollen ist — auf
              einem Lobpreisabend sogar die tragende. */}
            {meeting.hasSongSlot && (
              <RoleChip
                kind="SONG"
                people={meeting.songLeaders.map((leader) => leader.person)}
              />
            )}
            {meeting.hasSnackSlot && (
              <RoleChip
                kind="SNACK"
                people={meeting.snackResponsibles.map((row) => row.person)}
              />
            )}
          </div>
        )}

        {answerable && (
          <div className="mt-3">
            <AnswerButtons meeting={meeting} onAnswered={setNoteFor} />
          </div>
        )}
      </Link>

      {/* **Geschwister des Links, nicht sein Kind.** `Sheet` rendert sein
          Overlay als `position: fixed` ohne Portal, und die Karte trägt
          `active:scale` — das macht sie zum Bezugsrahmen, und der Schleier säße
          dann in der Karte statt über der Seite. */}
      {me && (
        <AnswerNoteSheet
          meetingId={meeting.id}
          personId={me.id}
          status={noteFor}
          note={myRow?.note ?? null}
          lateMinutes={myRow?.lateMinutes ?? null}
          onClose={() => setNoteFor(null)}
        />
      )}
    </>
  );
}
