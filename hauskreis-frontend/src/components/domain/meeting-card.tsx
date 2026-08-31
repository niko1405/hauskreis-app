'use client';

/**
 * Eine Terminkarte in der Liste. Zeigt, was man beim Überfliegen braucht:
 * wann, was, wo, wer — und was noch offen ist.
 */
import { MapPin, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { PRESSABLE } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatDay, formatDayRange, formatRelativeDay } from '@/lib/date';
import {
  MEETING_TYPE_LABEL,
  isMeetingPast,
  meetingHeadline,
} from '@/lib/meeting';
import type { MeetingListItem } from '@/lib/api/types';
import { RoleChip } from './role-badge';

export function MeetingCard({
  meeting,
  onPrefetch,
}: {
  meeting: MeetingListItem;
  onPrefetch?: (meetingId: string) => void;
}) {
  const cancelled = meeting.status === 'CANCELLED';
  const past = isMeetingPast(meeting);
  // Wer zugesagt hat, sonst niemand: „weiß noch nicht" ist keine Zusage, und
  // wer gar keine Zeile hat, zählt als eben das. Dass hier dieselbe Menge
  // steht wie unter „Wer kommt" auf der Detailseite, sorgt der Server —
  // Eingeladene und Ausgetretene kommen nicht mit.
  const attending = meeting.attendances.filter(
    (a) => a.status === 'ATTENDING',
  ).length;
  const topicPeople = meeting.topicResponsibles.map((r) => r.person);
  const isWorship = meeting.type === 'LOBPREIS_GEBET';

  return (
    <Link
      href={`/termin?id=${meeting.id}`}
      onMouseEnter={() => onPrefetch?.(meeting.id)}
      onTouchStart={() => onPrefetch?.(meeting.id)}
      className={cn(
        'block rounded-card border p-5 shadow-sm',
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
            {meeting.type !== 'STANDARD' && (
              <span className="text-stone-400">
                {MEETING_TYPE_LABEL[meeting.type]}
              </span>
            )}
          </div>
        </div>

        {/* Hier stand erst der Gastgeber-Avatar, dann der Zusage-Umschalter.
            Beide sind weg: Der Avatar stand doppelt (unten als Rollen-Chip),
            und geantwortet wird seit dem Antwort-Balken nur noch am Termin —
            drei Fassungen derselben Frage waren zwei zu viel.

            Was bleibt, ist die Zahl, die vorher klein zwischen Ort und
            Terminart stand und dort unterging. Sie zählt **nur die Zusagen**;
            „geplant für" auf der Detailseite meint bewusst etwas anderes
            (Zusagen plus Unentschiedene, die Menge, mit der der Server
            rechnet). Zwei Zahlen mit demselben Wort wären genau der Fehler,
            den die Detailseite einmal hatte.

            Anders als der Umschalter steht sie auch an vergangenen und
            abgesagten Abenden: „wer war da" ist dort die bessere Frage. */}
        {attending > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-xs font-bold text-stone-600">
            <Users size={13} className="text-terracotta-500" />
            {attending} dabei
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
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
          <RoleChip kind="HOST" people={meeting.host ? [meeting.host] : []} />
        )}
        {meeting.hasTopicSlot && <RoleChip kind="TOPIC" people={topicPeople} />}
        {/* Und das Testimony, das an derselben Stelle des Abends steht — es
            fehlte hier wie die Musik davor. Auf einem Lobpreisabend zeigte die
            Karte damit Gastgeber und Musik, aber nicht, wer erzählt. */}
        {meeting.hasTestimonySlot && (
          <RoleChip
            kind="TESTIMONY"
            people={meeting.testimonyPerson ? [meeting.testimonyPerson] : []}
          />
        )}
        {/* Musik fehlte hier, obwohl sie eine der drei Rollen ist — auf einem
            Lobpreisabend sogar die tragende. */}
        {meeting.hasSongSlot && (
          <RoleChip
            kind="SONG"
            people={meeting.songLeaders.map((leader) => leader.person)}
          />
        )}
      </div>
    </Link>
  );
}
