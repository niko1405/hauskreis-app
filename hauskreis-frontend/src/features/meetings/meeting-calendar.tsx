'use client';

/**
 * Monatsansicht. Auf dem Telefon bewusst schmal: Zahl plus Punkt, und die
 * Termine des Monats als Liste darunter — ein Raster mit Text in den Zellen
 * wäre auf 390 px nicht mehr lesbar.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { useMeetingList } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import {
  addMonths,
  endOfMonth,
  formatDay,
  formatMonth,
  isToday,
  parseDay,
  startOfMonth,
  startOfWeek,
  toDay,
  today,
} from '@/lib/date';
import { meetingHeadline } from '@/lib/meeting';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function MeetingCalendar() {
  const [anchor, setAnchor] = useState(() => startOfMonth(today()));

  const from = anchor;
  const to = endOfMonth(anchor);
  const query = useMeetingList({ scope: 'all', from, to, take: 100 });

  const byDate = useMemo(
    () => new Map(query.items.map((meeting) => [meeting.date, meeting])),
    [query.items],
  );

  const days = useMemo(() => buildGrid(anchor), [anchor]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <IconButton
          label="Voriger Monat"
          onClick={() => setAnchor(addMonths(anchor, -1))}
        >
          <ChevronLeft size={18} />
        </IconButton>
        <p className="font-serif text-lg font-bold text-stone-800">
          {formatMonth(anchor)}
        </p>
        <IconButton
          label="Nächster Monat"
          onClick={() => setAnchor(addMonths(anchor, 1))}
        >
          <ChevronRight size={18} />
        </IconButton>
      </div>

      {query.error && <ErrorState error={query.error} />}

      <div className="rounded-card border border-line bg-card p-3">
        <div className="grid grid-cols-7 gap-1 pb-2">
          {WEEKDAYS.map((day) => (
            <span
              key={day}
              className="text-center text-[10px] font-bold text-stone-400"
            >
              {day}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const meeting = byDate.get(day);
            const inMonth = day.slice(0, 7) === anchor.slice(0, 7);

            const cell = (
              <span
                className={cn(
                  'flex aspect-square flex-col items-center justify-center gap-1 rounded-md text-xs',
                  inMonth ? 'text-stone-700' : 'text-stone-300',
                  isToday(day) &&
                    'bg-terracotta-50 font-bold text-terracotta-700',
                  meeting && 'font-bold',
                )}
              >
                {parseDay(day).getDate()}
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    meeting
                      ? meeting.status === 'CANCELLED'
                        ? 'bg-stone-300'
                        : 'bg-terracotta-500'
                      : 'bg-transparent',
                  )}
                />
              </span>
            );

            return meeting ? (
              <Link
                key={day}
                href={`/termine/${meeting.id}`}
                aria-label={`${formatDay(day)}: ${meetingHeadline(meeting)}`}
                className="transition-colors hover:bg-stone-50"
              >
                {cell}
              </Link>
            ) : (
              <span key={day}>{cell}</span>
            );
          })}
        </div>
      </div>

      {query.isLoading ? (
        <CardSkeleton />
      ) : (
        <ul className="space-y-2">
          {query.items.map((meeting) => (
            <li key={meeting.id}>
              <Link
                href={`/termine/${meeting.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-line bg-card p-3 transition-colors hover:border-line-strong"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-terracotta-500">
                    {formatDay(meeting.date)}
                  </span>
                  <span className="block truncate text-sm font-semibold text-stone-800">
                    {meetingHeadline(meeting)}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-stone-400">
                  {meeting.location?.name ?? 'Ort offen'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sechs Wochen ab dem Montag vor dem Monatsersten — immer gleich hoch. */
function buildGrid(monthStart: string): string[] {
  const first = startOfWeek(monthStart);
  const days: string[] = [];
  const cursor = parseDay(first);

  for (let i = 0; i < 42; i += 1) {
    days.push(toDay(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
