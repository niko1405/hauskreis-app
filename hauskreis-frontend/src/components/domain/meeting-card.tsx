'use client';

/**
 * Eine Terminkarte in der Liste. Zeigt, was man beim Überfliegen braucht:
 * wann, was, wo, wer — und was noch offen ist.
 */
import { MapPin, Users } from 'lucide-react';
import Link from '@/components/ui/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { PRESSABLE } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatDay, formatDayRange, formatRelativeDay } from '@/lib/date';
import {
  attendanceCounts,
  isMeetingPast,
  meetingHeadline,
  meetingKindLabel,
} from '@/lib/meeting';
import { useMe, usePeople } from '@/lib/api/hooks';
import type { AttendanceStatus, MeetingListItem } from '@/lib/api/types';
import { AnswerNoteSheet } from './answer-note-sheet';
import { ANSWERS } from './attendance-answers';
import { RoleChip } from './role-badge';
import { useAttendanceAnswer } from './use-attendance-answer';

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
  const { answer } = useAttendanceAnswer(meeting);
  /** Welche Antwort gerade nach einem Satz fragt — `null` heißt: keine. */
  const [noteFor, setNoteFor] = useState<AttendanceStatus | null>(null);

  const cancelled = meeting.status === 'CANCELLED';
  const past = isMeetingPast(meeting);
  const counts = attendanceCounts(people.data ?? [], meeting.attendances);
  // An einem kommenden Abend die Menge, mit der geplant wird (Zusagen plus
  // Unentschiedene); an einem vergangenen oder abgesagten nur, wer da war.
  // Dieselbe Unterscheidung wie auf der Detailseite: „geplant für" ist keine
  // Aussage über gestern.
  const shown = past || cancelled ? counts.attending : counts.planned;
  const topicPeople = meeting.topicResponsibles.map((r) => r.person);
  // Die Tönung des Lobpreisabends kommt aus denselben Bausteinen wie sein
  // Name: Wo kein Thema, aber ein Testimony steht, dreht sich der Abend ums
  // Erzählen.
  const isWorship = !meeting.hasTopicSlot && meeting.hasTestimonySlot;

  const mine = meeting.attendances.find((a) => a.personId === me?.id);
  const myStatus = mine?.status ?? 'UNKNOWN';
  const myNote = mine?.note ?? null;
  // Dieselbe Regel, mit der die Detailseite ihren Antwort-Balken zeigt: An
  // einem vergangenen oder abgesagten Abend gibt es nichts mehr zuzusagen.
  const answerable = me !== undefined && !past && !cancelled;

  const choose = async (
    event: React.MouseEvent,
    next: AttendanceStatus,
  ): Promise<void> => {
    // Die Karte **ist** ein Link. Ohne beides führt jeder Tipp zusätzlich auf
    // die Detailseite — und die Antwort wäre nicht mehr zu sehen.
    event.preventDefault();
    event.stopPropagation();
    // Nur wenn wirklich geantwortet wurde. Wer die Rollen-Rückfrage abbricht,
    // soll nicht in einem Feld für eine Notiz landen, die zu nichts gehört.
    if (await answer(next)) setNoteFor(next);
  };

  return (
    <>
      <Link
        href={`/termin?id=${meeting.id}`}
        onMouseEnter={() => onPrefetch?.(meeting.id)}
        onTouchStart={() => onPrefetch?.(meeting.id)}
        className={cn(
          // `@container`: Ob die Antwort-Knöpfe neben die Rollen passen, hängt
          // an der Breite **dieser Karte** und nicht an der des Fensters.
          // Zwischen `md` und ~1000px ist die Spalte neben der Seitenleiste
          // erst gut 450px breit — ein `md:` stellte sie dort nebeneinander,
          // wo kein Platz ist.
          '@container block rounded-card border p-5 shadow-sm',
          PRESSABLE,
          'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
          isWorship
            ? 'border-topic-line bg-gradient-to-br from-topic-bg to-card'
            : 'border-line bg-card',
          cancelled && 'opacity-60',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
                {/* Ein Zeitraum steht als einer da: „14. – 16. August" ist ein
                    Termin, keine Reihe aus dreien. */}
                {meeting.endDate
                  ? formatDayRange(meeting.date, meeting.endDate)
                  : formatDay(meeting.date)}
              </span>
              {!past && (
                <span className="text-[10px] font-semibold text-stone-400">
                  {formatRelativeDay(meeting.date)}
                </span>
              )}
              {cancelled && <Badge variant="alert">Abgesagt</Badge>}
            </div>

            <h3 className="mt-1 truncate font-serif text-lg font-bold text-stone-900">
              {meetingHeadline(meeting)}
            </h3>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-stone-500">
              <span className="flex items-center gap-1">
                <MapPin size={12} className="text-stone-400" />
                {/* Ein Termin ohne Ort ist kein Fehler — z. B. draußen im Park. */}
                {meeting.location?.name ?? 'Ort noch offen'}
              </span>
              {/* Nur, wenn der Abend einen eigenen Titel trägt: Sonst steht
                  die Bezeichnung schon als Überschrift darüber, und zweimal
                  dasselbe ist eines zu viel. */}
              {meeting.title && (
                <span className="text-stone-400">
                  {meetingKindLabel(meeting)}
                </span>
              )}
            </div>
          </div>

          {/* Hier stand erst der Gastgeber-Avatar, dann der Zusage-Umschalter.
              Der Avatar stand doppelt (unten als Rollen-Chip); der Umschalter
              ist als drei Antworten unter die Rollen gewandert, wo Platz für
              ihre Beschriftung ist.

              Was hier steht, ist die Zahl, die vorher klein zwischen Ort und
              Terminart stand und dort unterging — und sie sagt **dasselbe wie
              die Detailseite**. „3 dabei" zählte einmal nur die Zusagen,
              während darunter „Geplant für 8" stand; als Gastgeber plant man
              aber mit der größeren Menge, und mit der rechnet auch der Server.
              Zwei Zahlen über denselben Abend, und die sichtbare war die
              knappere.

              Anders als die Antwort-Knöpfe steht sie auch an vergangenen und
              abgesagten Abenden — dort aber als „wer war da", denn „geplant
              für" ist keine Aussage über gestern. */}
          {shown > 0 && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-xs font-bold text-stone-600">
              <Users size={13} className="text-terracotta-500" />
              {shown} {past || cancelled ? 'dabei' : 'geplant'}
            </span>
          )}
        </div>

        {/* Zwei Zonen, ab `@lg` nebeneinander: links „wer macht was", rechts
            „bist du dabei". Darunter ist es ein Block und kein umbrechender
            Fluss — als eines von mehreren Flex-Kindern hing die Antwort mit
            acht Pixeln an den Rollen-Chips und las sich wie ein fünfter davon. */}
        <div className="mt-4 border-t border-line pt-3 @lg:flex @lg:items-center @lg:gap-3">
          <div className="flex flex-wrap items-center gap-2 @lg:flex-1">
            {meeting.location && !meeting.location.requiresHost ? (
              <p
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
                  'bg-terracotta-50 text-terracotta-700 border-terracotta-100',
                )}
              >
                <MapPin size={12} className="shrink-0" />
                <span>{meeting.location.name}</span>
              </p>
            ) : (
              <RoleChip
                kind="HOST"
                people={meeting.host ? [meeting.host] : []}
              />
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

          {/* Schmal eine eigene Zone unter einem zweiten Trennstrich, breit
              rechts daneben ohne ihn. Der Strich ist derselbe Gedanke wie der
              über den Rollen: Er trennt, was der Abend ist, von dem, was du
              dazu sagst. */}
          {answerable && (
            <div className="mt-3 flex gap-1.5 border-t border-line pt-3 @lg:mt-0 @lg:shrink-0 @lg:border-t-0 @lg:pt-0">
              {ANSWERS.map((option) => {
                const Icon = option.icon;
                const chosen = myStatus === option.status;

                return (
                  <button
                    key={option.status}
                    type="button"
                    aria-pressed={chosen}
                    onClick={(event) => void choose(event, option.status)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1 rounded-full border px-2.5 py-1.5',
                      'text-[11px] font-bold transition-colors @lg:flex-none',
                      'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
                      chosen
                        ? option.active
                        : 'border-line bg-card text-stone-400 hover:border-line-strong hover:text-stone-600',
                    )}
                  >
                    <Icon size={13} className="shrink-0" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Der eigene Satz, einzeilig — wie im eingeklappten Antwort-Balken. Er
            ist der Grund, aus dem man die Karte sonst öffnen müsste, um zu
            sehen, ob man überhaupt etwas dazugesagt hat. */}
        {answerable && myNote && (
          <p className="mt-2 truncate text-[11px] text-stone-400">„{myNote}"</p>
        )}
      </Link>

      {/* **Geschwister des Links, nicht sein Kind.** `Sheet` rendert sein
          Overlay als `position: fixed` ohne Portal, und die Karte trägt sowohl
          `@container` als auch `active:scale` — beides macht sie zum
          Bezugsrahmen, und der Schleier säße dann in der Karte statt über der
          Seite. */}
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
