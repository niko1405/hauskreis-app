'use client';

/**
 * „Archiv" — vergangene Termine, abgeschlossene Themen und die
 * Song-Datenbank. Gesucht wird serverseitig (`search`), sonst müsste die App
 * mit der Zeit alles laden, nur um clientseitig zu filtern.
 */
import { Music, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { InlineEdit, TextInput } from '@/components/ui/field';
import {
  CardSkeleton,
  EmptyState,
  ErrorState,
  LoadMore,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { LyricsLink } from '@/components/domain/lyrics-link';
import { SongSheet } from '@/components/domain/song-sheet';
import { LocationsCard } from './locations-card';
import {
  useArchiveSummary,
  useDeleteSong,
  useDeleteTopic,
  useMe,
  useRenameTopic,
  useSongList,
  useTopicList,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDay, formatRelativeDay } from '@/lib/date';
import { topicTitle } from '@/lib/meeting';
import type { SongListParams } from '@/lib/api/params';
import type { SongListItem, TopicListItem } from '@/lib/api/types';

type Tab = 'themen' | 'lieder' | 'orte';

export function ArchiveScreen() {
  const [tab, setTab] = useState<Tab>('themen');
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search).trim();
  const summary = useArchiveSummary();

  // Kein „Termine"-Tab mehr: nebeneinander gestellt sahen Termine und Themen
  // aus wie zwei Sichten auf dasselbe, und das waren sie fast auch — was man
  // an einem Abend nachschlägt, ist das Thema. Vergangene Termine bleiben in
  // der Datenbank und tragen weiter die Vorschlagslogik, sie haben nur keine
  // eigene Liste mehr; erreichbar sind sie über Kalender und Planungstabelle.
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'themen', label: 'Themen', count: summary.data?.totals.topics },
    { key: 'lieder', label: 'Lieder', count: summary.data?.totals.songs },
    // Orte gehören hierher und nicht in die Verwaltung: sie sind Teil dessen,
    // was die Gruppe über sich gesammelt hat, und jede:r darf sie pflegen.
    { key: 'orte', label: 'Orte' },
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

        {tab === 'themen' && <CompletedTopics search={deferred} />}
        {tab === 'lieder' && <SongLibrary search={deferred} />}
        {tab === 'orte' && <LocationsCard />}
      </div>
    </div>
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
            <TopicEntry topic={topic} />
          </li>
        ))}
      </ul>
      <LoadMore query={query} label="Ältere Themen" />
    </>
  );
}

/**
 * Ein Thema mit dem, was an seinen Abenden herauskam.
 *
 * Ein Thema kann sich über mehrere Dienstage ziehen, und jeder davon hat seine
 * eigene Zusammenfassung und seinen eigenen Actionstep — deshalb **pro Abend**
 * eine Zeile und nicht ein zusammengefasster Block. „Was hatten wir uns damals
 * vorgenommen" ist eine Frage an einen Abend, nicht an ein Thema.
 */
function TopicEntry({ topic }: { topic: TopicListItem }) {
  const me = useMe();
  const rename = useRenameTopic();
  const remove = useDeleteTopic();
  const confirm = useConfirm();
  const toast = useToast();

  // Abende ohne Notiz stehen nicht da: eine leere Zeile mit Datum sagt nur,
  // dass niemand etwas aufgeschrieben hat, und das weiß man auch so.
  const written = topic.meetings.filter(
    (meeting) => meeting.summaryText || meeting.actionstepText,
  );

  /**
   * Dieselbe Regel wie im Backend (`edit-rights.ts`): wer ein Thema
   * vorbereitet hat, benennt und räumt es auch. Ist niemand eingetragen, darf
   * jede:r — sonst wäre ein herrenloses Thema für immer unantastbar. Admins
   * immer.
   */
  const mayEdit =
    me.isAdmin ||
    topic.responsibles.length === 0 ||
    (me.me ? topic.responsibles.some((r) => r.person.id === me.me?.id) : false);

  const deleteTopic = async () => {
    const ok = await confirm({
      title: `„${topicTitle(topic)}" löschen?`,
      body:
        topic.meetings.length === 0
          ? 'Es hängt an keinem Abend — es geht nichts verloren.'
          : `Die ${topic.meetings.length} Abende bleiben stehen und verlieren nur ihr Thema. Zusammenfassung und Actionstep sind danach nur noch am Abend selbst zu finden.`,
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;

    remove.mutate(topic.id, {
      onSuccess: () => toast.success('Thema gelöscht.'),
    });
  };

  return (
    <Card>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <InlineEdit
            label="Thema"
            value={topic.title}
            // Wie auf der Terminseite: ein echter Vorschlag statt eines leeren
            // Platzhalters, abgeleitet und nicht gespeichert.
            emptyLabel={topicTitle(topic)}
            placeholder={topicTitle(topic)}
            className="font-serif text-base font-bold text-stone-900"
            saving={rename.isPending}
            onSave={
              mayEdit
                ? (title) => rename.mutate({ topicId: topic.id, title })
                : undefined
            }
          />
        </div>

        {mayEdit && (
          <IconButton
            label={`${topicTitle(topic)} löschen`}
            disabled={remove.isPending}
            onClick={deleteTopic}
          >
            <Trash2 size={14} />
          </IconButton>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <AvatarStack
          people={topic.responsibles.map((r) => r.person)}
          size="xs"
        />
        <span className="text-[11px] text-stone-400">
          {topic.meetings.length === 1
            ? '1 Abend'
            : `${topic.meetings.length} Abende`}
          {topic.meetings[0] && ` · ab ${formatDay(topic.meetings[0].date)}`}
        </span>
      </div>

      {written.length > 0 && (
        <ul className="mt-3 space-y-3 border-t border-line pt-3">
          {written.map((meeting) => (
            <li key={meeting.id}>
              {/* Zum Abend selbst: dort werden Zusammenfassung und Actionstep
                  geschrieben, dort gelten die Rechte schon, und dort steht das
                  Feld schon. Ein zweiter Bearbeitungsweg wäre eine zweite
                  Stelle, an der dieselbe Regel stimmen muss. */}
              <Link
                href={`/termine/${meeting.id}`}
                className="block rounded-md transition-colors hover:bg-shell"
              >
                <p className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">
                  {formatDay(meeting.date)}
                </p>
                {meeting.summaryText && (
                  <p className="mt-1 text-xs leading-relaxed text-stone-500">
                    {meeting.summaryText}
                  </p>
                )}
                {meeting.actionstepText && (
                  <div className="mt-1.5 rounded-md bg-terracotta-50/60 px-2.5 py-1.5">
                    <p className="text-[11px] font-semibold text-terracotta-700">
                      Actionstep: {meeting.actionstepText}
                    </p>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SongLibrary({ search }: { search: string }) {
  const [sort, setSort] =
    useState<NonNullable<SongListParams['sort']>>('popular');
  const [adding, setAdding] = useState(false);

  const query = useSongList({ search: search || undefined, sort });

  const sorts: { key: NonNullable<SongListParams['sort']>; label: string }[] = [
    { key: 'popular', label: 'Am häufigsten' },
    { key: 'recent', label: 'Zuletzt gesungen' },
    { key: 'title', label: 'A–Z' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-2">
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

        {/* Bisher wuchs die Liederliste nur über die Vorschläge an einem Abend.
            Ein Lied, das man kennt und erst nächsten Monat singen will, hatte
            keinen Weg hinein. */}
        <IconButton label="Lied hinzufügen" onClick={() => setAdding(true)}>
          <Plus size={16} />
        </IconButton>
      </div>

      <SongSheet open={adding} onClose={() => setAdding(false)} />

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
          <SongRow
            key={song.id}
            song={song}
            rank={sort === 'popular' ? index + 1 : undefined}
          />
        ))}
      </ul>

      <LoadMore query={query} label="Mehr Lieder" />
    </div>
  );
}

function SongRow({ song, rank }: { song: SongListItem; rank?: number }) {
  const remove = useDeleteSong();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-card p-3">
      {rank !== undefined && (
        <span className="w-6 shrink-0 text-center text-xs font-bold text-stone-300">
          {rank}
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
      <LyricsLink url={song.lyricsUrl} title={song.title} />

      <IconButton
        label={`${song.title} bearbeiten`}
        onClick={() => setEditing(true)}
      >
        <Pencil size={14} />
      </IconButton>

      <IconButton
        label={`${song.title} löschen`}
        onClick={async () => {
          const ok = await confirm({
            title: `„${song.title}" löschen?`,
            // Die Zahl gehört in die Rückfrage: ein Tippfehler von gestern und
            // ein Lied, das an acht Abenden lief, sind nicht dieselbe
            // Entscheidung.
            body:
              song.timesPlayed > 0
                ? `Das Lied lief an ${song.timesPlayed} Abend${song.timesPlayed === 1 ? '' : 'en'}. Es verschwindet auch dort aus der Liste.`
                : 'Das Lied wurde noch nie gesungen — es geht nichts verloren.',
            confirmLabel: 'Löschen',
            tone: 'danger',
          });
          if (!ok) return;

          remove.mutate(song.id, {
            onSuccess: () => toast.success(`„${song.title}" ist weg.`),
          });
        }}
      >
        <Trash2 size={14} />
      </IconButton>

      {editing && (
        <SongSheet open onClose={() => setEditing(false)} song={song} />
      )}
    </li>
  );
}
