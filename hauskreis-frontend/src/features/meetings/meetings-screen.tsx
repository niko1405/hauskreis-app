'use client';

/**
 * „Termine" — vier Sichten: Liste, Mehrwochen-Planung, Kalender, Geburtstage.
 * Alles außer der Liste wird erst geladen, wenn man es auswählt.
 */
import { Plus, Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useDeferredValue, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { MeetingCard } from '@/components/domain/meeting-card';
import { Button, IconButton } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { BirthdayCard } from '@/features/birthdays/birthday-card';
import {
  useBirthdays,
  useMeetingList,
  usePrefetchMeeting,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import type { BirthdayOccasion, MeetingListItem } from '@/lib/api/types';

const AssignmentTable = dynamic(
  () => import('./assignment-table').then((m) => m.AssignmentTable),
  { loading: () => <CardSkeleton /> },
);
const BirthdaysScreen = dynamic(
  () =>
    import('@/features/birthdays/birthdays-screen').then(
      (m) => m.BirthdaysScreen,
    ),
  { loading: () => <CardSkeleton /> },
);

const MeetingCalendar = dynamic(
  () => import('./meeting-calendar').then((m) => m.MeetingCalendar),
  { loading: () => <CardSkeleton /> },
);
const CreateMeetingSheet = dynamic(() =>
  import('./create-meeting-sheet').then((m) => m.CreateMeetingSheet),
);

type View = 'liste' | 'planung' | 'kalender' | 'geburtstage';

const VIEWS: { key: View; label: string }[] = [
  { key: 'liste', label: 'Liste' },
  { key: 'planung', label: 'Planung' },
  { key: 'kalender', label: 'Kalender' },
  // Zuletzt, weil man hierher gezielt kommt und nicht beim Durchblättern: Wer
  // „Termine" öffnet, sucht meistens einen Abend.
  { key: 'geburtstage', label: 'Geburtstage' },
];

/**
 * Ob die Adresse ein bestimmtes Register meint.
 *
 * Nur beim ersten Rendern gelesen und danach nicht mehr — das Register ist
 * eine Ansicht, kein Ort: Wer weiterklickt, soll nicht in seiner Historie
 * vier Einträge für dieselbe Seite finden. Gebraucht wird es für den Weg von
 * außen, etwa aus einer Benachrichtigung.
 */
function initialView(tab: string | null): View {
  return VIEWS.some((view) => view.key === tab) ? (tab as View) : 'liste';
}

export function MeetingsScreen() {
  const tab = useSearchParams().get('tab');
  const [view, setView] = useState<View>(() => initialView(tab));
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="Termine"
        action={
          <IconButton
            label="Termin anlegen"
            onClick={() => setCreating(true)}
            className="bg-terracotta-500 text-white hover:bg-terracotta-700 hover:text-white"
          >
            <Plus size={18} />
          </IconButton>
        }
      />

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-4">
        {VIEWS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={cn(
              'shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-colors',
              view === key
                ? 'border-terracotta-500 bg-terracotta-500 text-white'
                : 'border-line bg-card text-stone-500 hover:border-line-strong',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-5">
        {view === 'liste' && <MeetingListView />}
        {view === 'planung' && <AssignmentTable />}
        {view === 'kalender' && <MeetingCalendar />}
        {view === 'geburtstage' && <BirthdaysScreen />}
      </div>

      {creating && (
        <CreateMeetingSheet
          open={creating}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

/**
 * Ein Eintrag in der Liste — ein Abend oder ein Geburtstag.
 *
 * Ein ausgezeichneter Verbund statt zweier Listen untereinander: Beides steht
 * chronologisch, und „was kommt als nächstes" ist eine Frage, die man nicht
 * zweimal stellen will.
 */
type ListEntry =
  | { kind: 'meeting'; date: string; meeting: MeetingListItem }
  | { kind: 'birthday'; date: string; occasion: BirthdayOccasion };

function MeetingListView() {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const deferredSearch = useDeferredValue(search);

  const query = useMeetingList({
    scope,
    search: deferredSearch.trim() || undefined,
  });
  const prefetch = usePrefetchMeeting();
  const birthdays = useBirthdays();

  /**
   * Termine und Geburtstage in einer Liste, nach Datum.
   *
   * **Nur so weit, wie Termine geladen sind.** Der letzte geladene Abend ist
   * die Grenze — sonst hingen unten fünf Geburtstage im Leeren, für Wochen,
   * die noch gar nicht geplant sind. Wer „Mehr laden" drückt, schiebt die
   * Grenze mit, und die Geburtstage rücken nach.
   *
   * Keine bei „Vergangene" und keine bei aktiver Suche: Dort sucht man einen
   * Abend, und ein Geburtstag dazwischen wäre ein Treffer, den niemand gesucht
   * hat.
   */
  const entries = useMemo<ListEntry[]>(() => {
    const meetings: ListEntry[] = query.items.map((meeting) => ({
      kind: 'meeting',
      date: meeting.date,
      meeting,
    }));

    const horizon = query.items.at(-1)?.date;
    if (scope !== 'upcoming' || deferredSearch.trim() || !horizon) {
      return meetings;
    }

    const occasions: ListEntry[] = (birthdays.data?.upcoming ?? [])
      .filter((occasion) => occasion.occursOn <= horizon)
      .map((occasion) => ({
        kind: 'birthday',
        date: occasion.occursOn,
        occasion,
      }));

    return [...meetings, ...occasions].toSorted((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [query.items, birthdays.data, scope, deferredSearch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-300"
          />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Suchen …"
            className="pl-9"
            aria-label="Termine durchsuchen"
          />
        </div>
        <button
          type="button"
          onClick={() => setScope(scope === 'upcoming' ? 'past' : 'upcoming')}
          className="shrink-0 rounded-full border border-line bg-card px-3.5 py-2.5 text-xs font-bold text-stone-500 hover:border-line-strong"
        >
          {scope === 'upcoming' ? 'Kommende' : 'Vergangene'}
        </button>
      </div>

      {query.isLoading && (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {query.error && (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      )}

      {!query.isLoading && query.items.length === 0 && (
        <EmptyState
          title={
            deferredSearch
              ? 'Nichts gefunden'
              : scope === 'upcoming'
                ? 'Keine kommenden Termine'
                : 'Noch keine vergangenen Termine'
          }
          hint={
            scope === 'upcoming'
              ? 'Standard-Termine werden automatisch angelegt — du kannst auch hier einen eigenen anlegen.'
              : undefined
          }
        />
      )}

      <ul className="space-y-3">
        {entries.map((entry) =>
          entry.kind === 'meeting' ? (
            <li key={entry.meeting.id}>
              <MeetingCard meeting={entry.meeting} onPrefetch={prefetch} />
            </li>
          ) : (
            <li key={entry.occasion.id}>
              <BirthdayCard occasion={entry.occasion} />
            </li>
          ),
        )}
      </ul>

      {query.hasNextPage && (
        <Button
          variant="secondary"
          className="w-full"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Mehr laden ({query.items.length} von {query.total})
        </Button>
      )}
    </div>
  );
}
