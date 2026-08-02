'use client';

/**
 * Lieder eines Termins. Beim Eintragen wird in der Song-Datenbank gesucht;
 * gibt es das Lied noch nicht, legt der Server es mit an — so wächst die
 * Datenbank mit jedem Vorschlag (CLAUDE.md §6).
 */
import { Check, ExternalLink, Music, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { TextInput } from '@/components/ui/field';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import {
  useAddMeetingSong,
  useMeetingSongs,
  useRemoveMeetingSong,
  useSetMeetingSongSelected,
  useSongSearch,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatRelativeDay } from '@/lib/date';

export function SongsCard({ meetingId }: { meetingId: string }) {
  const songs = useMeetingSongs(meetingId);
  const remove = useRemoveMeetingSong(meetingId);
  const select = useSetMeetingSongSelected(meetingId);
  const toast = useToast();

  return (
    <section>
      <SectionTitle>Lieder</SectionTitle>
      <Card className="space-y-4">
        {songs.isLoading && <Skeleton className="h-16 w-full" />}

        {songs.data?.length === 0 && (
          <EmptyState
            title="Noch keine Lieder vorgeschlagen"
            hint="Wer Musik macht, freut sich über Vorschläge vorab."
          />
        )}

        <ul className="space-y-2">
          {(songs.data ?? []).map((entry) => (
            <li
              key={entry.id}
              className={cn(
                'flex items-center gap-3 rounded-md border p-3',
                entry.isSelected
                  ? 'border-music-line bg-music-bg/50'
                  : 'border-line bg-card',
              )}
            >
              <button
                type="button"
                aria-pressed={entry.isSelected}
                aria-label={
                  entry.isSelected
                    ? 'Aus der Auswahl nehmen'
                    : 'Für den Abend auswählen'
                }
                onClick={() =>
                  select.mutate({
                    meetingSongId: entry.id,
                    isSelected: !entry.isSelected,
                  })
                }
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                  entry.isSelected
                    ? 'border-music bg-music text-white'
                    : 'border-line-strong text-transparent hover:border-music',
                )}
              >
                <Check size={14} strokeWidth={3} />
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-stone-800">
                  {entry.song.title}
                </p>
                <p className="truncate text-[11px] text-stone-400">
                  {entry.song.artist ?? 'Unbekannt'}
                  {entry.suggestedBy && ` · von ${entry.suggestedBy.name}`}
                </p>
              </div>

              {entry.song.lyricsUrl && (
                <a
                  href={entry.song.lyricsUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Songtext öffnen"
                  className="shrink-0 text-stone-400 hover:text-terracotta-600"
                >
                  <ExternalLink size={15} />
                </a>
              )}

              <IconButton
                label="Lied entfernen"
                onClick={() =>
                  remove.mutate(entry.id, {
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                <Trash2 size={15} />
              </IconButton>
            </li>
          ))}
        </ul>

        <AddSongForm meetingId={meetingId} />
      </Card>
    </section>
  );
}

function AddSongForm({ meetingId }: { meetingId: string }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [expanded, setExpanded] = useState(false);

  const search = useSongSearch(title, expanded);
  const add = useAddMeetingSong(meetingId);
  const toast = useToast();

  const reset = () => {
    setTitle('');
    setArtist('');
    setExpanded(false);
  };

  const submit = (songId?: string) => {
    const payload = songId
      ? { songId }
      : {
          title: title.trim(),
          artist: artist.trim() === '' ? null : artist.trim(),
        };

    if (!songId && payload.title === '') return;

    add.mutate(payload, {
      onSuccess: reset,
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  if (!expanded) {
    return (
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => setExpanded(true)}
      >
        <Plus size={14} />
        Lied vorschlagen
      </Button>
    );
  }

  return (
    <div className="space-y-2 border-t border-line pt-4">
      {/* Kein autoFocus: auf dem Telefon schöbe die Tastatur sonst genau die
          Trefferliste aus dem Bild, die man gleich braucht. */}
      <TextInput
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Titel"
        aria-label="Titel des Liedes"
      />

      {/* Treffer aus der Song-Datenbank: schneller und ohne Dubletten. */}
      {(search.data?.items ?? []).length > 0 && (
        <ul className="space-y-1">
          {(search.data?.items ?? []).map((song) => (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => submit(song.id)}
                className="flex w-full items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-left hover:border-terracotta-400"
              >
                <Music size={13} className="shrink-0 text-stone-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-stone-700">
                    {song.title}
                  </span>
                  <span className="block truncate text-[10px] text-stone-400">
                    {song.artist ?? 'Unbekannt'} · {song.timesPlayed}× gesungen
                    {song.lastPlayedAt &&
                      `, zuletzt ${formatRelativeDay(song.lastPlayedAt)}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <TextInput
        value={artist}
        onChange={(event) => setArtist(event.target.value)}
        placeholder="Interpret (optional)"
        aria-label="Interpret"
      />

      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1" onClick={reset}>
          Abbrechen
        </Button>
        <Button
          size="sm"
          className="flex-1"
          loading={add.isPending}
          disabled={title.trim() === ''}
          onClick={() => submit()}
        >
          Hinzufügen
        </Button>
      </div>
    </div>
  );
}
