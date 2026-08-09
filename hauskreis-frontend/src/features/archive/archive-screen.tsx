'use client';

/**
 * „Archiv" — vergangene Termine, abgeschlossene Themen und die
 * Song-Datenbank. Gesucht wird serverseitig (`search`), sonst müsste die App
 * mit der Zeit alles laden, nur um clientseitig zu filtern.
 */
import { Music, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { TextInput } from '@/components/ui/field';
import {
  CardSkeleton,
  EmptyState,
  ErrorState,
  LoadMore,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useLongPress } from '@/components/ui/use-long-press';
import { LyricsLink } from '@/components/domain/lyrics-link';
import { SongSheet } from '@/components/domain/song-sheet';
import { LocationsCard } from './locations-card';
import {
  useArchiveSummary,
  useDeleteSong,
  useSongList,
  useTopicList,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDay, formatRelativeDay } from '@/lib/date';
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

        {tab === 'themen' && <TopicArchive search={deferred} />}
        {tab === 'lieder' && <SongLibrary search={deferred} />}
        {tab === 'orte' && <LocationsCard />}
      </div>
    </div>
  );
}

/**
 * Die Themen des Hauskreises.
 *
 * Gelistet wird, was **gehalten** wurde: ein Thema steht im Archiv, sobald einer
 * seiner Abende vorbei ist — und bleibt dann drin, auch für alles, was danach
 * noch dazukommt. Der Schalter „Nur meine" nimmt zusätzlich die eigenen dazu,
 * die noch vor sich haben, gehalten zu werden.
 *
 * Die Abende eines Themas stehen nicht mehr hier, sondern auf seiner eigenen
 * Seite. Ein Thema mit fünf Einheiten machte diese Liste sonst zu einer Wand.
 */
function TopicArchive({ search }: { search: string }) {
  const [nurEigene, setNurEigene] = useState(false);

  const query = useTopicList({
    scope: nurEigene ? 'mine' : 'public',
    search: search || undefined,
  });

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs font-medium text-stone-500">
        <input
          type="checkbox"
          checked={nurEigene}
          onChange={(event) => setNurEigene(event.target.checked)}
          className="size-3.5 accent-terracotta-500"
        />
        Nur meine Themen
        <span className="text-stone-400">
          — auch die, die noch niemand gesehen hat
        </span>
      </label>

      {query.isLoading && <CardSkeleton />}
      {query.error && <ErrorState error={query.error} />}

      {!query.isLoading && !query.error && query.items.length === 0 && (
        <EmptyState
          title={nurEigene ? 'Du hast noch kein Thema' : 'Noch keine Themen'}
          hint={
            nurEigene
              ? 'Sobald du für einen Abend zugeteilt bist, kannst du dort eines anfangen.'
              : 'Hier stehen Themen, sobald ein Abend dazu vorbei ist.'
          }
        />
      )}

      {query.items.length > 0 && (
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
      )}
    </div>
  );
}

/** Eine Zeile in der Liste — der Weg hinein führt auf die Themenseite. */
function TopicEntry({ topic }: { topic: TopicListItem }) {
  const gehalten = topic.sessions.filter((session) => session.held);
  const leute = [
    ...(topic.owner ? [topic.owner] : []),
    ...topic.collaborators.map((c) => c.person),
  ];

  return (
    <Link href={`/archiv/themen/${topic.id}`} className="block">
      <Card className="transition-colors hover:border-line-strong">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-base font-bold text-stone-900">
            {topic.title ?? 'Thema ohne Titel'}
          </h3>
          {/* Nur für die eigenen: bei einem fremden Thema sagt „läuft" nichts,
              was man tun könnte. */}
          {topic.mine && topic.status === 'RUNNING' && (
            <Badge variant="topic">läuft</Badge>
          )}
        </div>

        {topic.summaryText && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-stone-500">
            {topic.summaryText}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <AvatarStack people={leute} size="xs" />
          <span className="text-[11px] text-stone-400">
            {topic.sessions.length === 1 ? '1 Einheit' : `${topic.sessions.length} Einheiten`}
          </span>
        </div>
      </Card>
    </Link>
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

      {query.items.length > 0 && (
        // Einmal über der Liste, nicht an jeder Zeile: eine Geste, die man
        // nicht sieht, muss dastehen — aber siebzehnmal untereinander wäre sie
        // lauter als die Liste selbst.
        <p className="px-1 text-[11px] text-stone-400">
          Lange auf ein Lied drücken, um es zu ändern oder zu löschen.
        </p>
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

/**
 * Eine Liedzeile — und ihre Knöpfe erst nach langem Druck.
 *
 * Stift und Papierkorb standen dauerhaft da: zwei Ziele an jeder Zeile einer
 * Liste, durch die man scrollt, und beide traf der Daumen zuverlässiger als
 * die Zeile selbst. Jetzt liegen sie hinter einer Geste, die man nicht
 * versehentlich macht — lange drücken oder rechtsklicken.
 *
 * **Kein Platzhalter, der sie freihält.** Drei Knöpfe sind auf einem 390px
 * breiten Bildschirm ein Drittel der Zeile; sie dauerhaft freizuhalten nähme
 * dem Titel genau den Platz, den diese Änderung ihm geben soll. Dass die Zeile
 * beim Aufklappen umbricht, ist verkraftbar — sie ist in dem Moment ohnehin
 * hervorgehoben, man sieht also, dass etwas passiert ist.
 */
function SongRow({ song, rank }: { song: SongListItem; rank?: number }) {
  const remove = useDeleteSong();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { handlers, selectNone } = useLongPress(() => setRevealed(true));

  const deleteSong = async () => {
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
  };

  return (
    <li
      {...handlers}
      className={cn(
        'flex items-center gap-3 rounded-md border bg-card p-3 transition-colors',
        revealed ? 'border-terracotta-100 bg-terracotta-50/40' : 'border-line',
        selectNone,
      )}
    >
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
      {song.createdBy && !revealed && (
        <Avatar person={song.createdBy} size="xs" />
      )}
      <LyricsLink url={song.lyricsUrl} title={song.title} />

      {revealed && (
        <>
          <IconButton
            label={`${song.title} bearbeiten`}
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} />
          </IconButton>

          <IconButton label={`${song.title} löschen`} onClick={deleteSong}>
            <Trash2 size={14} />
          </IconButton>

          {/* Ein Weg zurück, ohne die Seite zu verlassen. Ohne ihn bliebe die
              Zeile aufgeklappt, bis die Liste neu lädt. */}
          <IconButton label="Fertig" onClick={() => setRevealed(false)}>
            <X size={14} />
          </IconButton>
        </>
      )}

      {editing && (
        <SongSheet open onClose={() => setEditing(false)} song={song} />
      )}
    </li>
  );
}
