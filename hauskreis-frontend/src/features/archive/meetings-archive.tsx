'use client';

/**
 * Vergangene Abende im Archiv — das Register, das es einmal gab und das
 * abgeschafft wurde, weil es dasselbe zeigte wie die Themen.
 *
 * Seit es die **Nachbereitung** gibt, stimmt das nicht mehr: ein Abend ohne
 * Thema trägt jetzt eigenen Inhalt, den keine Themenseite abdeckt. Genau der
 * Lobpreisabend, an dem sich die Gruppe etwas vorgenommen hat, war vorher
 * nirgends nachzulesen.
 *
 * Es steht trotzdem an letzter Stelle: was man im Archiv sucht, ist meistens ein
 * Thema oder ein Lied, und nur manchmal ein Abend.
 *
 * Keine eigene Route dafür — `…/meetings?scope=past` kann Suche, Datumsgrenzen
 * und Paginierung längst, und die Antwort führt beide Quellen der Nachbereitung
 * schon mit. Ein zweiter Endpunkt wäre eine zweite Gelegenheit, dieselbe Frage
 * anders zu beantworten.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  CardSkeleton,
  EmptyState,
  ErrorState,
  LoadMore,
} from '@/components/ui/states';
import { useMeetingList } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDayFull, formatDayRange } from '@/lib/date';
import { MEETING_TYPE_LABEL, meetingHeadline } from '@/lib/meeting';
import type { MeetingListItem } from '@/lib/api/types';

export function MeetingsArchive({ search }: { search: string }) {
  const [mitAbgesagten, setMitAbgesagten] = useState(false);

  const query = useMeetingList({
    scope: 'past',
    search: search || undefined,
    includeCancelled: mitAbgesagten ? 'true' : 'false',
  });

  return (
    <div className="space-y-3">
      {/* Aus, weil ein abgesagter Abend im Archiv nichts beantwortet — wer
          nachliest, was war, sucht Abende, an denen etwas war. Aber erreichbar:
          „wann ist der Hauskreis eigentlich ausgefallen" ist eine echte Frage. */}
      <label className="flex cursor-pointer items-center gap-2.5 px-1">
        <input
          type="checkbox"
          checked={mitAbgesagten}
          onChange={(event) => setMitAbgesagten(event.target.checked)}
          className="h-4 w-4 shrink-0 accent-terracotta-500"
        />
        <span className="text-xs font-semibold text-stone-500">
          Abgesagte Termine anzeigen
        </span>
      </label>

      {query.isLoading && <CardSkeleton />}
      {query.error && <ErrorState error={query.error} />}

      {!query.isLoading && !query.error && query.items.length === 0 && (
        <EmptyState
          title={search ? 'Nichts gefunden' : 'Noch keine vergangenen Termine'}
          hint={
            search
              ? undefined
              : 'Hier stehen die Abende, sobald der erste vorbei ist.'
          }
        />
      )}

      {query.items.length > 0 && (
        <>
          <ul className="space-y-3">
            {query.items.map((meeting) => (
              <li key={meeting.id}>
                <MeetingEntry meeting={meeting} />
              </li>
            ))}
          </ul>
          <LoadMore query={query} label="Ältere Termine" />
        </>
      )}
    </div>
  );
}

/**
 * Ein Abend als Zeile: wann, was für einer, und was von ihm übrig ist.
 *
 * Zusammenfassung und Actionstep kommen aus **zwei** Quellen — der Einheit eines
 * Themas oder der Nachbereitung des Abends. Welche gilt, entscheidet derselbe
 * Baustein wie im Backend (`actionstepOf`): der Abend kann beides tragen, wenn
 * das Thema nachträglich abgeschaltet wurde, und dann gilt der Baustein und
 * nicht das erste Feld, in dem etwas steht.
 */
function MeetingEntry({ meeting }: { meeting: MeetingListItem }) {
  const cancelled = meeting.status === 'CANCELLED';

  const session = meeting.hasTopicSlot ? meeting.topicSession : null;
  const summary = session ? session.summaryText : meeting.summaryText;
  const actionstep = session ? session.actionstepText : meeting.actionstepText;

  return (
    <Link href={`/termine/${meeting.id}`} className="block">
      <Card
        className={cn(
          'transition-colors hover:border-line-strong',
          cancelled && 'opacity-60',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
              {/* Ein Zeitraum steht als einer da — eine Freizeit ist ein
                  Termin, keine Reihe aus dreien. */}
              {meeting.endDate
                ? formatDayRange(meeting.date, meeting.endDate)
                : formatDayFull(meeting.date)}
              {' · '}
              {meeting.startTime} Uhr
            </p>
            <h3 className="mt-0.5 truncate font-serif text-base font-bold text-stone-900">
              {meetingHeadline(meeting)}
            </h3>
            <p className="mt-0.5 text-[11px] text-stone-400">
              {MEETING_TYPE_LABEL[meeting.type]}
            </p>
          </div>

          {cancelled && <Badge variant="alert">Abgesagt</Badge>}
        </div>

        {summary && (
          <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-stone-500">
            {summary}
          </p>
        )}

        {actionstep && (
          <div className="mt-2.5 rounded-md bg-terracotta-50/60 px-2.5 py-1.5">
            <p className="text-[11px] font-semibold text-terracotta-700">
              Actionstep: {actionstep}
            </p>
          </div>
        )}

        {/* Ein Abend ohne beides ist kein Fehler — nicht jeder Dienstag
            hinterlässt einen Text. Gesagt wird es trotzdem, sonst sieht die
            Karte aus, als hätte sie nicht fertig geladen. */}
        {!summary && !actionstep && !cancelled && (
          <p className="mt-2.5 text-xs text-stone-400 italic">
            Nichts notiert.
          </p>
        )}
      </Card>
    </Link>
  );
}
