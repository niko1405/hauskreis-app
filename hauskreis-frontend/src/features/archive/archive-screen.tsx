'use client';

/**
 * „Archiv" — vergangene Termine, abgeschlossene Themen und die
 * Song-Datenbank. Gesucht wird serverseitig (`search`), sonst müsste die App
 * mit der Zeit alles laden, nur um clientseitig zu filtern.
 */
import { ExternalLink, Music, Search } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextInput } from '@/components/ui/field';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useArchiveSummary,
  useMeetingList,
  usePrefetchMeeting,
  useSongList,
  useTopicList,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDay, formatRelativeDay } from '@/lib/date';
import { meetingHeadline } from '@/lib/meeting';
import type { SongListParams } from '@/lib/api/params';

type Tab = 'termine' | 'themen' | 'lieder';

export function ArchiveScreen() {
  const [tab, setTab] = useState<Tab>('termine');
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search).trim();
  const summary = useArchiveSummary();

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'termine', label: 'Termine', count: summary.data?.totals.meetings },
    { key: 'themen', label: 'Themen', count: summary.data?.totals.topics },
    { key: 'lieder', label: 'Lieder', count: summary.data?.totals.songs },
  ];

  return (
    <div>
      <PageHeader
        title="Archiv"
        subtitle={
          summary.data?.firstMeetingDate
            ? `Seit ${formatDay(summary.data.firstMeetingDate)} · ${summary.data.totals.songsPlayed} gesungene Lieder`
            : undefined
        }
      />

      <div className="space-y-4 px-5">
        <div className="relative">
          <Search
            size={15}
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-300"
          />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Durchsuchen …"
            className="pl-9"
            aria-label="Archiv durchsuchen"
          />
        </div>

        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={cn(
                'shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-colors',
                tab === key
                  ? 'border-terracotta-500 bg-terracotta-500 text-white'
                  : 'border-line bg-card text-stone-500 hover:border-line-strong',
              )}
            >
              {label}
              {count !== undefined && (
                <span className="ml-1.5 opacity-60">{count}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'termine' && <PastMeetings search={deferred} />}
        {tab === 'themen' && <CompletedTopics search={deferred} />}
        {tab === 'lieder' && <SongLibrary search={deferred} />}
      </div>
    </div>
  );
}

function PastMeetings({ search }: { search: string }) {
  const query = useMeetingList({ scope: 'past', search: search || undefined });
  const prefetch = usePrefetchMeeting();

  if (query.isLoading) return <CardSkeleton />;
  if (query.error) return <ErrorState error={query.error} />;
  if (query.items.length === 0) {
    return <EmptyState title="Noch nichts im Archiv" />;
  }

  return (
    <>
      <ul className="space-y-3">
        {query.items.map((meeting) => (
          <li key={meeting.id}>
            <Link
              href={`/termine/${meeting.id}`}
              onMouseEnter={() => prefetch(meeting.id)}
              className="block rounded-card border border-line bg-card p-4 transition-colors hover:border-line-strong"
            >
              <p className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">
                {formatDay(meeting.date)}
              </p>
              <p className="mt-0.5 font-serif text-base font-bold text-stone-900">
                {meetingHeadline(meeting)}
              </p>
              {meeting.summaryText && (
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-stone-500">
                  {meeting.summaryText}
                </p>
              )}
              {meeting.actionstepText && (
                <p className="mt-2 rounded-md bg-terracotta-50/60 px-2.5 py-1.5 text-[11px] font-semibold text-terracotta-700">
                  Actionstep: {meeting.actionstepText}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <LoadMore query={query} label="Ältere Termine" />
    </>
  );
}

function CompletedTopics({ search }: { search: string }) {
  const query = useTopicList({
    status: 'COMPLETED',
    search: search || undefined,
  });

  if (query.isLoading) return <CardSkeleton />;
  if (query.error) return <ErrorState error={query.error} />;
  if (query.items.length === 0) {
    return <EmptyState title="Noch keine abgeschlossenen Themen" />;
  }

  return (
    <>
      <ul className="space-y-3">
        {query.items.map((topic) => (
          <li key={topic.id}>
            <Card>
              <p className="font-serif text-base font-bold text-stone-900">
                {/* Ein Thema ohne Titel ist eines, für das niemand einen
                    festgelegt hat — kein fehlender Wert. */}
                {topic.title ?? (
                  <span className="text-stone-400 italic">Ohne Titel</span>
                )}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <AvatarStack
                  people={topic.responsibles.map((r) => r.person)}
                  size="xs"
                />
                <span className="text-[11px] text-stone-400">
                  {topic.meetings.length === 1
                    ? '1 Abend'
                    : `${topic.meetings.length} Abende`}
                  {topic.meetings[0] &&
                    ` · ab ${formatDay(topic.meetings[0].date)}`}
                </span>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <LoadMore query={query} label="Ältere Themen" />
    </>
  );
}

function SongLibrary({ search }: { search: string }) {
  const [sort, setSort] =
    useState<NonNullable<SongListParams['sort']>>('popular');

  const query = useSongList({ search: search || undefined, sort });

  const sorts: { key: NonNullable<SongListParams['sort']>; label: string }[] = [
    { key: 'popular', label: 'Am häufigsten' },
    { key: 'recent', label: 'Zuletzt gesungen' },
    { key: 'title', label: 'A–Z' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {sorts.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            aria-pressed={sort === key}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors',
              sort === key
                ? 'bg-stone-800 text-white'
                : 'bg-stone-100 text-stone-500 hover:bg-stone-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {query.isLoading && <CardSkeleton />}
      {query.error && <ErrorState error={query.error} />}
      {!query.isLoading && query.items.length === 0 && (
        <EmptyState
          title="Noch keine Lieder"
          hint="Die Datenbank wächst mit jedem Vorschlag an einem Termin."
        />
      )}

      <ul className="space-y-2">
        {query.items.map((song, index) => (
          <li
            key={song.id}
            className="flex items-center gap-3 rounded-md border border-line bg-card p-3"
          >
            {sort === 'popular' && (
              <span className="w-6 shrink-0 text-center text-xs font-bold text-stone-300">
                {index + 1}
              </span>
            )}
            <Music size={15} className="shrink-0 text-stone-300" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-stone-800">
                {song.title}
              </p>
              <p className="truncate text-[11px] text-stone-400">
                {song.artist ?? 'Unbekannt'} · {song.timesPlayed}×
                {song.lastPlayedAt &&
                  `, zuletzt ${formatRelativeDay(song.lastPlayedAt)}`}
              </p>
            </div>
            {song.createdBy && <Avatar person={song.createdBy} size="xs" />}
            {song.lyricsUrl && (
              <a
                href={song.lyricsUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Songtext zu ${song.title}`}
                className="shrink-0 text-stone-400 hover:text-terracotta-600"
              >
                <ExternalLink size={15} />
              </a>
            )}
          </li>
        ))}
      </ul>

      <LoadMore query={query} label="Mehr Lieder" />
    </div>
  );
}

function LoadMore({
  query,
  label,
}: {
  query: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
  label: string;
}) {
  if (!query.hasNextPage) return null;
  return (
    <Button
      variant="secondary"
      className="mt-3 w-full"
      loading={query.isFetchingNextPage}
      onClick={() => void query.fetchNextPage()}
    >
      {label}
    </Button>
  );
}
