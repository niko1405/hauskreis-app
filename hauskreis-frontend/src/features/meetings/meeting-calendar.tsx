'use client';

/**
 * Monatsansicht. Auf dem Telefon bewusst schmal: Zahl plus Punkt, und die
 * Termine des Monats als Liste darunter — ein Raster mit Text in den Zellen
 * wäre auf 390 px nicht mehr lesbar.
 *
 * **Ein Termin kann mehrere Tage füllen.** Eine Freizeit von Freitag bis
 * Sonntag steht auch am Samstag: Ein Termin belegt jeden Tag seines Zeitraums, und aus
 * den Punkten wird ein durchgehender Balken — drei einzelne Punkte sähen aus
 * wie drei Termine.
 *
 * In der Liste darunter steht er trotzdem **einmal**: die Frage „was ist
 * diesen Monat" beantwortet man nicht dreimal hintereinander mit demselben.
 *
 * **Ein besonderer Termin ist golden** — Balken und Zeile, wie der Rahmen in
 * der Terminliste. Gewöhnliche Abende sind terracotta, abgesagte grau, und der
 * rote Punkt in der Ecke ist ein Geburtstag.
 */
import { Cake, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from '@/components/ui/link';
import { useMemo, useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { useBirthdayOccasions, useMe, useMeetingList } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import {
  addDays,
  addMonths,
  endOfMonth,
  formatDay,
  formatDayMonth,
  formatMonth,
  isToday,
  parseDay,
  startOfMonth,
  startOfWeek,
  toDay,
  today,
} from '@/lib/date';
import { meetingHeadline, meetingPhase } from '@/lib/meeting';
import { isAnswerable } from '@/components/domain/answer-buttons';
import { ANSWER } from '@/components/domain/attendance-answers';
import { DateBox, TimeAndPlace } from '@/components/domain/date-box';
import type { BirthdayOccasion, MeetingListItem } from '@/lib/api/types';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function MeetingCalendar() {
  const [anchor, setAnchor] = useState(() => startOfMonth(today()));

  const from = anchor;
  const to = endOfMonth(anchor);
  const query = useMeetingList({ scope: 'all', from, to, take: 100 });

  const byDate = useMemo(() => spanByDate(query.items), [query.items]);
  const days = useMemo(() => buildGrid(anchor), [anchor]);

  /**
   * Geburtstage im sichtbaren Raster — **auch vergangene**.
   *
   * Nicht aus der Übersicht: Die führt je Person nur das nächste Vorkommen,
   * und wer im Kalender zurückblättert, sah den Geburtstag von letzter Woche
   * nicht mehr. Vergangene Runden bleiben als Geschichte stehen und haben eine
   * eigene Ansicht, also stehen sie hier auch (`…/birthdays/occasions`). Aus
   * der Zeit vor der App steht nichts da — ehrlicher als eine Wiederholung,
   * die aus einem Geburtsdatum errechnet wäre und eine Zuständigkeit
   * behauptete, die es nie gab. Der Zeitraum ist das ganze Raster, damit auch
   * die grauen Tage vom Vor- und Folgemonat ihren Punkt tragen.
   */
  const birthdays = useBirthdayOccasions(days[0]!, days[days.length - 1]!);
  const birthdaysByDate = useMemo(() => {
    const map = new Map<string, BirthdayOccasion[]>();

    for (const occasion of birthdays.data ?? []) {
      const existing = map.get(occasion.occursOn);
      if (existing) existing.push(occasion);
      else map.set(occasion.occursOn, [occasion]);
    }

    return map;
  }, [birthdays.data]);

  const thisMonth = (birthdays.data ?? []).filter(
    (occasion) => occasion.occursOn.slice(0, 7) === anchor.slice(0, 7),
  );

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
                          : span.special
                            ? 'bg-special'
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
 * Eine Zeile der Monatsliste — kompakt, zum Nachsehen und Hineingehen.
 *
 * **Hier wird nicht geantwortet**, anders als in der Terminliste und am Termin.
 * Den Kalender macht man auf, um einen Tag zu finden; die Knöpfe daneben
 * machten aus jeder Zeile eine Frage und die Liste doppelt so unruhig. Was man
 * selbst geantwortet hat, steht rechts als Punkt — die Auskunft bleibt, die
 * Entscheidung fällt in der Liste oder am Abend.
 *
 * Gebaut wie die Terminkarte, nur knapp: dasselbe Datums-Kästchen (klein, ohne
 * Monat — der steht über dem Raster; ein Zeitraum als „14–16"), der Titel und
 * die Zeile „wann und wo". Ein laufender Abend ist grün getönt, ein besonderer
 * golden gerahmt, ein abgesagter gedämpft.
 *
 * Weiterhin **keine Teilnehmerzahl**: Die Zeile beantwortet „was ist wann",
 * nicht „mit wie vielen".
 */
function MonthRow({ meeting }: { meeting: MeetingListItem }) {
  const { me } = useMe();

  const cancelled = meeting.status === 'CANCELLED';
  const running = !cancelled && meetingPhase(meeting) === 'running';
  const special = meeting.special && !cancelled;
  const mine = isAnswerable(meeting, me?.id)
    ? ANSWER[
        meeting.attendances.find((row) => row.personId === me?.id)?.status ??
          'UNKNOWN'
      ]
    : null;

  return (
    <li>
      <Link
        href={`/termin?id=${meeting.id}`}
        className={cn(
          'flex items-center gap-3 rounded-lg border bg-card p-2.5 pr-4 transition-colors',
          'hover:border-line-strong focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
          special ? 'border-special-line' : 'border-line',
          // Dieselbe Tönung wie in der Liste und auf „Heute": grün heißt
          // „gilt gerade".
          running && 'border-success-line bg-success-bg/30',
          cancelled && 'opacity-60',
        )}
      >
        <DateBox
          day={meeting.date}
          until={meeting.endDate}
          size="sm"
          tone={special ? 'special' : 'default'}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-base leading-tight font-bold text-stone-900">
            {meetingHeadline(meeting)}
          </p>
          {cancelled ? (
            <p className="mt-0.5 text-[12px] font-semibold text-alert">
              Fällt aus
            </p>
          ) : (
            <TimeAndPlace
              size="sm"
              startTime={meeting.startTime}
              location={meeting.location}
            />
          )}
        </div>

        {mine && (
          <span
            title={mine.short}
            className={cn('size-2 shrink-0 rounded-full', mine.dot)}
          >
            <span className="sr-only">Deine Antwort: {mine.short}</span>
          </span>
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
