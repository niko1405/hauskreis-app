'use client';

/**
 * Eine Terminkarte in der Liste. Zeigt, was man beim Überfliegen braucht:
 * wann, was, wo, wer — und was noch offen ist.
 */
import { MapPin, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useMe, useSetAttendance } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import {
  formatDay,
  formatDayRange,
  formatRelativeDay,
  isPast,
} from '@/lib/date';
import { MEETING_TYPE_LABEL, meetingHeadline } from '@/lib/meeting';
import type { MeetingListItem } from '@/lib/api/types';
import { AttendanceToggle } from './attendance-toggle';
import { RoleChip } from './role-badge';

export function MeetingCard({
  meeting,
  onPrefetch,
}: {
  meeting: MeetingListItem;
  onPrefetch?: (meetingId: string) => void;
}) {
  const { me } = useMe();
  const setAttendance = useSetAttendance(meeting.id);

  const cancelled = meeting.status === 'CANCELLED';
  const past = isPast(meeting.date);
  const attending = meeting.attendances.filter(
    (a) => a.status === 'ATTENDING',
  ).length;
  const topicPeople = (meeting.topic?.responsibles ?? []).map((r) => r.person);
  const isWorship = meeting.type === 'LOBPREIS_GEBET';

  const myStatus =
    meeting.attendances.find((a) => a.personId === me?.id)?.status ?? 'UNKNOWN';
  // An einem vergangenen oder abgesagten Abend gibt es nichts mehr zuzusagen.
  const answerable = me !== undefined && !past && !cancelled;

  return (
    <Link
      href={`/termine/${meeting.id}`}
      onMouseEnter={() => onPrefetch?.(meeting.id)}
      onTouchStart={() => onPrefetch?.(meeting.id)}
      className={cn(
        'block rounded-card border p-5 shadow-sm transition-transform active:scale-[0.99]',
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
            {!isPast(meeting.date) && (
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
            {attending > 0 && (
              <span className="flex items-center gap-1">
                <Users size={12} className="text-stone-400" />
                {attending} dabei
              </span>
            )}
            {meeting.type !== 'STANDARD' && (
              <span className="text-stone-400">
                {MEETING_TYPE_LABEL[meeting.type]}
              </span>
            )}
          </div>
        </div>

        {/* Hier stand der Gastgeber-Avatar — und damit doppelt, was in der
            Fußzeile ohnehin als Rollen-Chip steht. Der Platz gehört jetzt der
            Frage, die man beim Durchgehen der Liste wirklich hat. */}
        {answerable && (
          <AttendanceToggle
            status={myStatus}
            onAnswer={(status) =>
              me && setAttendance.mutate({ personId: me.id, status })
            }
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <RoleChip
          kind="HOST"
          people={meeting.host ? [meeting.host] : []}
          emptyLabel={
            meeting.location && !meeting.location.requiresHost
              ? 'Kein Host nötig'
              : undefined
          }
        />
        {meeting.hasTopicSlot && <RoleChip kind="TOPIC" people={topicPeople} />}
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
