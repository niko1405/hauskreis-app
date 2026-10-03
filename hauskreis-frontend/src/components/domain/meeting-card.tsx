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
import {
  attendanceCounts,
  meetingHeadline,
  meetingKindLabel,
  meetingPhase,
} from '@/lib/meeting';
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
  const counts = attendanceCounts(people.data ?? [], meeting.attendances);
  // An einem kommenden Abend die Menge, mit der geplant wird (Zusagen plus
  // Unentschiedene); an einem vergangenen oder abgesagten nur, wer da war.
  // Dieselbe Unterscheidung wie auf der Detailseite: „geplant für" ist keine
  // Aussage über gestern.
  const shown = past || cancelled ? counts.attending : counts.planned;
  const topicPeople = meeting.topicResponsibles.map((r) => r.person);

  const myNote =
    meeting.attendances.find((row) => row.personId === me?.id)?.note ?? null;
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
          // Hier stand für den Lobpreisabend ein amberfarbener Verlauf. Er
          // war die letzte Rollenfarbe auf dieser Karte: Was für ein Abend das
          // ist, sagen die Überschrift und die Chips darunter — und eine
          // getönte Karte in einer Liste sah aus, als sei sie hervorgehoben.
          'border-line bg-card',
          // Dieselbe Tönung wie „Aktueller Termin" auf „Heute": Grün ist die
          // Farbe von „gilt gerade". In einer Liste über Wochen ist der Abend,
          // an dem man sitzt, der eine, den man sofort finden will.
          running && 'border-success-line bg-success-bg/30',
          cancelled && 'opacity-60',
        )}
      >
        <div className="flex items-start gap-3">
          {/* **Das Datum als Kästchen.** Es stand vorher als Kleinschrift-Zeile
              über dem Titel und war damit das Unauffälligste an einer Karte, die
              man genau danach durchsucht: „wann ist der nächste". Jetzt ist es
              der Anker links, an dem das Auge die Liste heruntergeht.

              Ein Zeitraum bekommt keins: „14.–16." passt nicht in ein Kästchen,
              und eine Freizeit ist kein Tag. Dort steht die Spanne wie bisher
              als Zeile über dem Titel. */}
          {meeting.endDate === null && <DateBox day={meeting.date} />}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {/* Ein Zeitraum steht als einer da: „14. – 16. August" ist ein
                    Termin, keine Reihe aus dreien — und er hat kein Kästchen. */}
                {meeting.endDate && (
                  <span className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
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
                  rechnet. „3 dabei" zählte einmal nur die Zusagen, während
                  darunter „Geplant für 8" stand — als Gastgeber plant man mit
                  der größeren.

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

            {/* Die Uhrzeit stand bisher nur auf „Heute". Hier gehört sie dazu,
                seit das Kästchen den Tag trägt: Der Tag ist die Sortierung, die
                Uhrzeit die Verabredung — und seit sie sich einstellen lässt,
                ist „18 Uhr wie immer" keine sichere Annahme mehr.

                Die Art des Abends steht nur dahinter, wenn er einen eigenen
                Titel trägt: Sonst steht sie schon als Überschrift darüber, und
                zweimal dasselbe ist eines zu viel. */}
            <TimeAndPlace
              startTime={meeting.startTime}
              location={meeting.location}
              extra={meeting.title ? meetingKindLabel(meeting) : undefined}
            />
          </div>
        </div>

        {/* **Untereinander, in jeder Breite.** Hier standen die Antworten ab
            32 rem rechts neben den Rollen-Chips. Das war eng gedacht: Im
            Fenster nebeneinander las sich die Antwort wie ein weiterer Chip.
            Mit dem `@lg` fallen die einzigen Container-Queries des Projekts.

            **Ohne Trennstriche.** Über den Chips lag einer und über den
            Antworten ein zweiter — auf einer Karte, die selbst schon von einem
            Rahmen eingefasst ist, waren das drei waagerechte Linien
            übereinander. Was die Striche sagen sollten, sagen die Formen
            längst: Chips sind Pillen mit Namen darin, die Antwort ein
            umrandeter Schalter. Getrennt wird jetzt über den Abstand. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Braucht der Ort keinen Gastgeber — Schlosspark, Café —, steht
              hier **nichts**. Der Ort selbst steht schon in der Zeile über
              den Chips; hier stand er ein zweites Mal, als terracotta Chip,
              und behauptete damit eine Rolle, die es an dem Abend gar nicht
              gibt. Dieselbe Regel wie in den Zuständigkeiten am Termin
              (`meetingRoles`). */}
          {(meeting.location === null || meeting.location.requiresHost) && (
            <RoleChip kind="HOST" people={meeting.host ? [meeting.host] : []} />
          )}
          {meeting.hasTopicSlot && (
            <RoleChip kind="TOPIC" people={topicPeople} />
          )}
          {/* Und das Testimony, das an derselben Stelle des Abends steht — es
              fehlte hier wie die Musik davor. Auf einem Lobpreisabend zeigte
              die Karte damit Gastgeber und Musik, aber nicht, wer erzählt. */}
          {meeting.hasTestimonySlot && (
            <RoleChip
              kind="TESTIMONY"
              people={meeting.testimonyPerson ? [meeting.testimonyPerson] : []}
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

        {answerable && (
          <div className="mt-3">
            <AnswerButtons meeting={meeting} onAnswered={setNoteFor} />
          </div>
        )}

        {/* Der eigene Satz, einzeilig — wie im eingeklappten Antwort-Balken. Er
            ist der Grund, aus dem man die Karte sonst öffnen müsste, um zu
            sehen, ob man überhaupt etwas dazugesagt hat. */}
        {answerable && myNote && (
          <p className="mt-2 truncate text-[11px] text-stone-400">„{myNote}"</p>
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
          note={myNote}
          onClose={() => setNoteFor(null)}
        />
      )}
    </>
  );
}
