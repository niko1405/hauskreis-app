'use client';

/**
 * Lieder eines Termins. Beim Eintragen wird in der Song-Datenbank gesucht;
 * gibt es das Lied noch nicht, legt der Server es mit an — so wächst die
 * Datenbank mit jedem Vorschlag (CLAUDE.md §6).
 */
import { Check, Library, Music, Plus, Trash2 } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { TextInput } from '@/components/ui/field';
import { EmptyState, Skeleton } from '@/components/ui/states';
import {
  useAddMeetingSong,
  useMeetingSongs,
  useRemoveMeetingSong,
  useSetMeetingSongSelected,
  useSongSearch,
} from '@/lib/api/hooks';
import { LyricsLink } from '@/components/domain/lyrics-link';
import { SongPickerSheet } from '@/components/domain/song-picker-sheet';
import { cn } from '@/lib/cn';
import { formatRelativeDay } from '@/lib/date';

export function SongsCard({
  meetingId,
  readOnly = false,
}: {
  meetingId: string;
  /**
   * Ein vergangener Abend. Was gesungen wurde, wurde gesungen — eine
   * nachträgliche Änderung verfälscht die Zählung in der Song-Datenbank
   * (`timesPlayed`, `lastPlayedAt`) und damit das Archiv.
   */
  readOnly?: boolean;
}) {
  const songs = useMeetingSongs(meetingId);
  const remove = useRemoveMeetingSong(meetingId);
  const select = useSetMeetingSongSelected(meetingId);
  const [picking, setPicking] = useState(false);

  return (
    <section>
      <SectionTitle>{readOnly ? 'Gesungen' : 'Lieder'}</SectionTitle>
      <Card className="space-y-4">
        {songs.isLoading && <Skeleton className="h-16 w-full" />}

        {songs.data?.length === 0 && (
          <EmptyState
            title={
              readOnly
                ? 'Für diesen Abend ist nichts notiert'
                : 'Noch keine Lieder vorgeschlagen'
            }
            hint={
              readOnly
                ? undefined
                : 'Wer Musik macht, freut sich über Vorschläge vorab.'
            }
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
                disabled={readOnly}
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
                  readOnly && 'cursor-default hover:border-line-strong',
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

              <LyricsLink url={entry.song.lyricsUrl} title={entry.song.title} />

              {!readOnly && (
                <IconButton
                  label="Lied entfernen"
                  onClick={() => remove.mutate(entry.id)}
                >
                  <Trash2 size={15} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>

        {!readOnly && (
          <div className="space-y-3 border-t border-line pt-4">
            {/* Zwei Wege, und der zweite fehlte: das Archiv war vom Termin aus
                nicht erreichbar. Er steht zuerst, weil er meistens der
                richtige ist — die Gruppe singt vieles wieder. */}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setPicking(true)}
            >
              <Library size={15} />
              Aus dem Archiv
            </Button>

            <AddSongForm meetingId={meetingId} />
          </div>
        )}
      </Card>

      {picking && (
        <SongPickerSheet
          open
          onClose={() => setPicking(false)}
          meetingId={meetingId}
          alreadyPicked={(songs.data ?? []).map((entry) => entry.song.id)}
        />
      )}
    </section>
  );
}

function AddSongForm({ meetingId }: { meetingId: string }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [lyricsUrl, setLyricsUrl] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Wie im Archiv: die Eingabe bleibt flüssig, die Abfrage hinkt nach.
  const search = useSongSearch(useDeferredValue(title), expanded);
  const add = useAddMeetingSong(meetingId);

  const reset = () => {
    setTitle('');
    setArtist('');
    setLyricsUrl('');
    setExpanded(false);
    setConfirming(false);
  };

  const trimmedTitle = title.trim();
  const hits = search.data?.items ?? [];
  /**
   * Ein Lied, das genau so schon in der Datenbank steht. Dann ist „neu
   * anlegen" fast immer ein Versehen — man hat den Treffer übersehen.
   */
  const exactHit = hits.find(
    (song) => song.title.toLowerCase() === trimmedTitle.toLowerCase(),
  );

  const submit = (songId?: string) => {
    const payload = songId
      ? { songId }
      : {
          title: trimmedTitle,
          artist: artist.trim() === '' ? null : artist.trim(),
          lyricsUrl: lyricsUrl.trim() === '' ? null : lyricsUrl.trim(),
        };

    if (!songId && trimmedTitle === '') return;

    add.mutate(payload, {
      onSuccess: reset,
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

      <TextInput
        type="url"
        inputMode="url"
        value={lyricsUrl}
        onChange={(event) => setLyricsUrl(event.target.value)}
        placeholder="Link zum Songtext (optional)"
        aria-label="Link zum Songtext"
      />

      {/* Der Text selbst wird nicht gespeichert — wir verlinken nach draußen
          (CLAUDE.md §6). */}

      {confirming ? (
        <div className="space-y-2 rounded-md border border-topic-line bg-topic-bg p-3">
          <p className="text-xs leading-relaxed text-topic">
            {exactHit ? (
              <>
                „{exactHit.title}" steht schon in eurer Liederliste. Willst du
                wirklich einen zweiten Eintrag anlegen?
              </>
            ) : (
              <>
                „{trimmedTitle}" kennt die App noch nicht. Neu anlegen? Es
                landet dann in eurer Liederliste und lässt sich beim nächsten
                Mal einfach auswählen.
              </>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => setConfirming(false)}
            >
              Nochmal ansehen
            </Button>
            <Button
              size="sm"
              className="flex-1"
              loading={add.isPending}
              onClick={() => submit()}
            >
              {exactHit ? 'Trotzdem anlegen' : 'Anlegen'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={reset}>
            Abbrechen
          </Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={trimmedTitle === ''}
            onClick={() => setConfirming(true)}
          >
            Hinzufügen
          </Button>
        </div>
      )}
    </div>
  );
}
