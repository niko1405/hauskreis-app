'use client';

/**
 * „Termine" — drei Sichten auf dieselben Daten: Liste, Mehrwochen-Planung,
 * Kalender. Kalender und Tabelle werden erst geladen, wenn man sie auswählt.
 */
import { Plus, Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { MeetingCard } from '@/components/domain/meeting-card';
import { Button, IconButton } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { useMeetingList, usePrefetchMeeting } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';

const AssignmentTable = dynamic(
  () => import('./assignment-table').then((m) => m.AssignmentTable),
  { loading: () => <CardSkeleton /> },
);
const MeetingCalendar = dynamic(
  () => import('./meeting-calendar').then((m) => m.MeetingCalendar),
  { loading: () => <CardSkeleton /> },
);
const CreateMeetingSheet = dynamic(() =>
  import('./create-meeting-sheet').then((m) => m.CreateMeetingSheet),
);

type View = 'liste' | 'planung' | 'kalender';

const VIEWS: { key: View; label: string }[] = [
  { key: 'liste', label: 'Liste' },
  { key: 'planung', label: 'Planung' },
  { key: 'kalender', label: 'Kalender' },
];

export function MeetingsScreen() {
  const [view, setView] = useState<View>('liste');
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

function MeetingListView() {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const deferredSearch = useDeferredValue(search);

  const query = useMeetingList({
    scope,
    search: deferredSearch.trim() || undefined,
  });
  const prefetch = usePrefetchMeeting();

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
              ? 'Standard-Termine legt das Backend selbst an — sonst hier einen eigenen anlegen.'
              : undefined
          }
        />
      )}

      <ul className="space-y-3">
        {query.items.map((meeting) => (
          <li key={meeting.id}>
            <MeetingCard meeting={meeting} onPrefetch={prefetch} />
          </li>
        ))}
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
