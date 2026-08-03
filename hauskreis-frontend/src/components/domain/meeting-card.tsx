'use client';

/**
 * Eine Terminkarte in der Liste. Zeigt, was man beim Überfliegen braucht:
 * wann, was, wo, wer — und was noch offen ist.
 */
import { MapPin, Users } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { formatDay, formatRelativeDay, isPast } from '@/lib/date';
import {
  MEETING_TYPE_LABEL,
  hasTopicSlot,
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
  const attending = meeting.attendances.filter(
    (a) => a.status === 'ATTENDING',
  ).length;
  const topicPeople = (meeting.topic?.responsibles ?? []).map((r) => r.person);
  const isWorship = meeting.type === 'LOBPREIS_GEBET';

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
              {formatDay(meeting.date)}
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

        {meeting.host ? (
          <div className="flex shrink-0 flex-col items-center gap-1">
            <Avatar person={meeting.host} size="sm" />
            <span className="text-[9px] font-bold tracking-wider text-stone-400 uppercase">
              Host
            </span>
          </div>
        ) : (
          meeting.location?.requiresHost === false && (
            <span className="shrink-0 text-[10px] text-stone-400 italic">
              kein Host nötig
            </span>
          )
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
        {hasTopicSlot(meeting.type) && (
          <RoleChip kind="TOPIC" people={topicPeople} />
        )}
        {/* Musik fehlte hier, obwohl sie eine der drei Rollen ist — auf einem
            Lobpreisabend sogar die tragende. */}
        <RoleChip
          kind="SONG"
          people={meeting.songLeaders.map((leader) => leader.person)}
        />
      </div>
    </Link>
  );
}
