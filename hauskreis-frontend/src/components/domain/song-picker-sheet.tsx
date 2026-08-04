'use client';

/**
 * Lieder aus dem Archiv an einen Abend holen.
 *
 * Am Termin gab es bisher nur den Weg über das Eintragen: tippen, warten, aus
 * höchstens acht Treffern wählen. Wer wissen wollte, was die Gruppe eigentlich
 * singt, musste ins Archiv wechseln — und dort gab es keinen Weg zurück an den
 * Abend. Hier ist dieselbe Datenbank, aber mit dem Knopf daneben.
 *
 * Dieselben drei Sortierungen wie im Archiv, weil es dieselbe Frage ist: was
 * singen wir oft, was zuletzt, wie hieß das nochmal.
 */
import { useDeferredValue, useState } from 'react';
import { Check, Music, Search } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { TextInput } from '@/components/ui/field';
import { EmptyState, LoadMore, Skeleton } from '@/components/ui/states';
import { useAddMeetingSong, useSongList } from '@/lib/api/hooks';
import { formatRelativeDay } from '@/lib/date';
import { cn } from '@/lib/cn';
import type { SongListParams } from '@/lib/api/params';
import { LyricsLink } from './lyrics-link';

type Sort = NonNullable<SongListParams['sort']>;

const SORTS: { key: Sort; label: string }[] = [
  { key: 'popular', label: 'Am häufigsten' },
  { key: 'recent', label: 'Zuletzt gesungen' },
  { key: 'title', label: 'A–Z' },
];

export function SongPickerSheet({
  open,
  onClose,
  meetingId,
  /** Was schon am Abend hängt — steht dabei, aber lässt sich nicht doppeln. */
  alreadyPicked,
}: {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  alreadyPicked: readonly string[];
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('popular');

  // Hausregel aus Archiv und Terminliste: die Eingabe bleibt flüssig, die
  // Abfrage hinkt einen Tick hinterher.
  const deferred = useDeferredValue(search).trim();
  const query = useSongList({ search: deferred || undefined, sort });
  const add = useAddMeetingSong(meetingId);

  const picked = new Set(alreadyPicked);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Aus dem Archiv"
      subtitle="Lieder, die die Gruppe schon kennt"
    >
      <div className="space-y-3">
        <div className="relative">
          <Search
            size={15}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400"
          />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Titel oder Artist"
            aria-label="Lieder durchsuchen"
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          {SORTS.map(({ key, label }) => (
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

        {query.isLoading && <Skeleton className="h-24 w-full" />}

        {!query.isLoading && query.items.length === 0 && (
          <EmptyState
            title={deferred ? 'Nichts gefunden' : 'Noch keine Lieder'}
            hint={
              deferred
                ? 'Trag es unten als neues Lied ein — dann kennt die Gruppe es ab jetzt.'
                : 'Die Datenbank wächst mit jedem Vorschlag an einem Termin.'
            }
          />
        )}

        <ul className="space-y-1.5">
          {query.items.map((song) => {
            const alreadyThere = picked.has(song.id);

            return (
              <li key={song.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={alreadyThere || add.isPending}
                  onClick={() => add.mutate({ songId: song.id })}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2.5 rounded-md border p-2.5 text-left transition-colors',
                    alreadyThere
                      ? 'cursor-default border-music-line bg-music-bg/50'
                      : 'border-line bg-card hover:border-terracotta-400',
                  )}
                >
                  {alreadyThere ? (
                    <Check
                      size={14}
                      strokeWidth={3}
                      className="shrink-0 text-music"
                    />
                  ) : (
                    <Music size={14} className="shrink-0 text-stone-300" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-stone-800">
                      {song.title}
                    </span>
                    <span className="block truncate text-[11px] text-stone-400">
                      {song.artist ?? 'Unbekannt'} · {song.timesPlayed}×
                      {song.lastPlayedAt &&
                        `, zuletzt ${formatRelativeDay(song.lastPlayedAt)}`}
                    </span>
                  </span>
                </button>

                <LyricsLink url={song.lyricsUrl} title={song.title} />
              </li>
            );
          })}
        </ul>

        <LoadMore query={query} label="Mehr Lieder" />
      </div>
    </Sheet>
  );
}
