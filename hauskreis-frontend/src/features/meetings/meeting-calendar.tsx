'use client';

/**
 * Monatsansicht. Auf dem Telefon bewusst schmal: Zahl plus Punkt, und die
 * Termine des Monats als Liste darunter — ein Raster mit Text in den Zellen
 * wäre auf 390 px nicht mehr lesbar.
 *
 * **Ein Termin kann mehrere Tage füllen.** Eine Freizeit von Freitag bis
 * Sonntag stand bisher nur am Freitag, und wer am Samstag nachsah, fand einen
 * leeren Tag. Deshalb belegt ein Termin jeden Tag seines Zeitraums, und aus
 * den Punkten wird ein durchgehender Balken — drei einzelne Punkte sähen aus
 * wie drei Termine.
 *
 * In der Liste darunter steht er trotzdem **einmal**: die Frage „was ist
 * diesen Monat" beantwortet man nicht dreimal hintereinander mit demselben.
 */
import { Cake, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { AttendanceToggle } from '@/components/domain/attendance-toggle';
import {
  useBirthdays,
  useMe,
  useMeetingList,
  useSetAttendance,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import {
  addDays,
  addMonths,
  endOfMonth,
  formatDay,
  formatDayMonth,
  formatDayRange,
  formatMonth,
  isPast,
  isToday,
  parseDay,
  startOfMonth,
  startOfWeek,
  toDay,
  today,
} from '@/lib/date';
import { meetingHeadline } from '@/lib/meeting';
import type { BirthdayOccasion, MeetingListItem } from '@/lib/api/types';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function MeetingCalendar() {
  const [anchor, setAnchor] = useState(() => startOfMonth(today()));

  const from = anchor;
  const to = endOfMonth(anchor);
  const query = useMeetingList({ scope: 'all', from, to, take: 100 });

  const byDate = useMemo(() => spanByDate(query.items), [query.items]);

  /**
   * Geburtstage in diesem Monat.
   *
   * Aus derselben Übersicht wie das Register „Geburtstage" — sie führt je
   * Person genau ein Vorkommen, nämlich das nächste. Für den Kalender heißt
   * das: Bis zu zwölf Monate voraus stimmt er, weiter zurück oder weiter
   * voraus steht nichts. Das ist ehrlicher als eine Wiederholung, die aus
   * einem Geburtsdatum errechnet wäre und dann eine Zuständigkeit behaupten
   * würde, die es noch gar nicht gibt.
   */
  const birthdays = useBirthdays();
  const birthdaysByDate = useMemo(() => {
    const map = new Map<string, BirthdayOccasion[]>();

    for (const occasion of birthdays.data?.upcoming ?? []) {
      const existing = map.get(occasion.occursOn);
      if (existing) existing.push(occasion);
      else map.set(occasion.occursOn, [occasion]);
    }

    return map;
  }, [birthdays.data]);

  const thisMonth = (birthdays.data?.upcoming ?? []).filter(
    (occasion) => occasion.occursOn.slice(0, 7) === anchor.slice(0, 7),
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
            const span = byDate.get(day);
            const celebrating = birthdaysByDate.get(day);
            const inMonth = day.slice(0, 7) === anchor.slice(0, 7);

            const cell = (
              <span
                className={cn(
                  'relative flex aspect-square flex-col items-center justify-center gap-1 rounded-md text-xs',
                  inMonth ? 'text-stone-700' : 'text-stone-300',
                  isToday(day) &&
                    'bg-terracotta-50 font-bold text-terracotta-700',
                  span && 'font-bold',
                )}
              >
                {/* Der Geburtstag oben in der Ecke und nicht als zweiter
                    Streifen: Ein Abend ist ein Termin, ein Geburtstag ist ein
                    Tag. Beide am selben Tag sollen nebeneinander lesbar sein
                    und nicht miteinander um dieselbe Zeile ringen. */}
                {celebrating && (
                  <span
                    aria-hidden
                    className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-alert"
                  />
                )}
                {parseDay(day).getDate()}
                {/* Ein Streifen über die Zellbreite statt eines Punkts: an
                    den Enden halb, dazwischen ganz. Das Raster hat `gap-1`,
                    die Segmente stoßen also nicht aneinander — sie lesen sich
                    trotzdem als eine Strecke, weil nur die beiden Enden rund
                    sind. Ein einzelner Tag bleibt der Punkt, der er war. */}
                <span className="flex h-1.5 w-full items-center">
                  <span
                    className={cn(
                      'h-1.5',
                      span
                        ? span.status === 'CANCELLED'
                          ? 'bg-stone-300'
                          : 'bg-terracotta-500'
                        : 'bg-transparent',
                      span?.spans
                        ? cn(
                            'w-full',
                            span.first && 'ml-auto w-1/2 rounded-l-full',
                            span.last && 'mr-auto w-1/2 rounded-r-full',
                          )
                        : 'mx-auto w-1.5 rounded-full',
                    )}
                  />
                </span>
              </span>
            );

            if (span) {
              const names = celebrating
                ?.map((occasion) => occasion.person.name)
                .join(', ');

              return (
                <Link
                  key={day}
                  href={`/termin?id=${span.id}`}
                  aria-label={`${formatDay(day)}: ${meetingHeadline(span)}${
                    names ? ` · Geburtstag: ${names}` : ''
                  }`}
                  className="transition-colors hover:bg-stone-50"
                >
                  {cell}
                </Link>
              );
            }

            // Ohne Abend führt der Tag zum Geburtstag — sonst wäre der Punkt
            // eine Auskunft, mit der man nichts anfangen kann.
            if (celebrating?.[0]) {
              return (
                <Link
                  key={day}
                  href={`/geburtstag?id=${celebrating[0].id}`}
                  aria-label={`${formatDay(day)}: Geburtstag von ${celebrating
                    .map((occasion) => occasion.person.name)
                    .join(', ')}`}
                  className="transition-colors hover:bg-stone-50"
                >
                  {cell}
                </Link>
              );
            }

            return <span key={day}>{cell}</span>;
          })}
        </div>
      </div>

      {thisMonth.length > 0 && (
        <ul className="space-y-1.5">
          {thisMonth.map((occasion) => (
            <li key={occasion.id}>
              <Link
                href={`/geburtstag?id=${occasion.id}`}
                className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2 transition-colors hover:border-terracotta-400"
              >
                <Cake size={13} className="shrink-0 text-alert" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-stone-700">
                  {occasion.person.name}
                </span>
                <span className="shrink-0 text-[11px] text-stone-400">
                  {formatDayMonth(occasion.occursOn)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {query.isLoading ? (
        <CardSkeleton />
      ) : (
        <ul className="space-y-2">
          {query.items.map((meeting) => (
            <MonthRow key={meeting.id} meeting={meeting} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Eine Zeile der Monatsliste. Dieselbe Antwort wie in der Terminliste, nur
 * schmaler — die drei Ansichten zeigen dieselben Termine, also darf die Frage
 * nicht davon abhängen, welche man gerade offen hat.
 */
function MonthRow({ meeting }: { meeting: MeetingListItem }) {
  const { me } = useMe();
  const setAttendance = useSetAttendance(meeting.id);

  const cancelled = meeting.status === 'CANCELLED';
  const myStatus =
    meeting.attendances.find((a) => a.personId === me?.id)?.status ?? 'UNKNOWN';

  return (
    <li>
      <Link
        href={`/termin?id=${meeting.id}`}
        className={cn(
          'flex items-center justify-between gap-3 rounded-md border border-line bg-card p-3 transition-colors hover:border-line-strong',
          // Wie auf der Terminkarte: der Punkt im Raster oben war schon
          // grau, hier stand ein abgesagter Abend bisher wie jeder
          // andere.
          cancelled && 'opacity-60',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold text-terracotta-500">
            {meeting.endDate
              ? formatDayRange(meeting.date, meeting.endDate)
              : formatDay(meeting.date)}
          </span>
          <span className="block truncate text-sm font-semibold text-stone-800">
            {meetingHeadline(meeting)}
          </span>
          <span className="block truncate text-[11px] text-stone-400">
            {cancelled
              ? 'Fällt aus'
              : (meeting.location?.name ?? 'Ort noch offen')}
          </span>
        </span>

        {me && !cancelled && !isPast(meeting.date) && (
          <AttendanceToggle
            status={myStatus}
            onAnswer={(status) =>
              setAttendance.mutate({ personId: me.id, status })
            }
          />
        )}
      </Link>
    </li>
  );
}

/**
 * Jeden Tag eines Termins auf ihn zeigen lassen — samt der Frage, wo im
 * Zeitraum dieser Tag liegt.
 *
 * `spans` unterscheidet den Balken vom Punkt, `first`/`last` seine Enden. Ohne
 * das wären drei Tage drei Punkte, und ein Zeitraum sähe aus wie drei Termine
 * in Folge.
 */
type DaySpan = MeetingListItem & {
  spans: boolean;
  first: boolean;
  last: boolean;
};

function spanByDate(meetings: MeetingListItem[]): Map<string, DaySpan> {
  const map = new Map<string, DaySpan>();

  for (const meeting of meetings) {
    const last = meeting.endDate ?? meeting.date;
    const spans = last !== meeting.date;

    for (let day = meeting.date; day <= last; day = addDays(day, 1)) {
      map.set(day, {
        ...meeting,
        spans,
        first: day === meeting.date,
        last: day === last,
      });
    }
  }

  return map;
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
