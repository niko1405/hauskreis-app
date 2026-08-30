'use client';

/**
 * Lieder eines Termins — **Setlist und Vorschläge, getrennt.**
 *
 * Vorher war es eine Liste, in der beides untereinander stand und sich nur
 * durch einen Haken unterschied. Zwei Fragen, eine Liste: „was singen wir" und
 * „was wurde vorgeschlagen" sind aber nicht dieselbe, und die erste ist die,
 * mit der die meisten hierherkommen.
 *
 * **Der Haken gehört denen, die ihn drücken dürfen.** Er stand für alle da,
 * ausgegraut, und brauchte darunter einen Satz, der erklärte, warum er nicht
 * geht — ein toter Knopf ist kein Hinweis, sondern ein Fehler. Wer nicht die
 * Musik macht, sieht ihn deshalb gar nicht; welche Gruppe eine Zeile ist, sagt
 * ohnehin schon die Überschrift darüber. Statt der verschlossenen Tür steht
 * unter der Karte, wer sie aufmacht.
 *
 * **Warum die Setlist terracotta ist und nicht mehr musikgrün.** Grün ist in
 * dieser App die Farbe der *Rolle* — das SONG-Abzeichen, die Person, die die
 * Musik macht. „Im Set" ist keine Rolle, sondern eine **Auswahl**, und Auswahl
 * ist überall terracotta: der aktive Tab, der gewählte Chip, der erste Platz
 * einer Rangliste.
 *
 * Beim Eintragen wird in der Song-Datenbank gesucht; gibt es das Lied noch
 * nicht, legt der Server es mit an — so wächst die Datenbank mit jedem
 * Vorschlag (CLAUDE.md §6).
 */
import {
  Check,
  ChevronDown,
  ListMusic,
  Music,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/states';
import {
  useMeetingSongs,
  useRemoveMeetingSong,
  useSetMeetingSongSelected,
} from '@/lib/api/hooks';
import { LyricsLink } from '@/components/domain/lyrics-link';
import { SongSuggestSheet } from '@/components/domain/song-suggest-sheet';
import { cn } from '@/lib/cn';
import type { MeetingSong } from '@/lib/api/types';

export function SongsCard({
  meetingId,
  editing,
  readOnly = false,
  mayPick = true,
}: {
  meetingId: string;
  /**
   * Der Bearbeitungsmodus der Seite — und hier gilt er **nur fürs Löschen**.
   *
   * Diese Karte war die einzige, die ihn gar nicht kannte: Neben jeder Zeile
   * stand dauerhaft ein Papierkorb, der ohne Rückfrage löscht. Auf einer Seite,
   * die man zehnmal öffnet, um nachzusehen, und einmal, um etwas zu ändern, ist
   * das eine Zeile zu nah am Daumen.
   *
   * Vorschlagen bleibt frei. Ein Lied vorzuschlagen ist der Normalfall dieser
   * Karte — wer etwas beitragen will, soll dafür keinen Schalter suchen müssen.
   * Und Abhaken hat ohnehin seine eigene Regel (`mayPick`).
   */
  editing: boolean;
  /**
   * Ein vergangener oder abgesagter Abend: Vorschlagen und Löschen sind vorbei.
   * **Abhaken nicht** — das hat seine eigene Regel, siehe `mayPick`.
   */
  readOnly?: boolean;
  /**
   * Ob die eigene Person die Auswahl treffen darf.
   *
   * Vor dem Abend nur, wer an dem Abend die Musik macht: das Abhaken ist dann
   * eine Entscheidung, „das singen wir", und die trifft, wer die Lieder übt.
   * Danach darf jede:r — dann ist es ein Protokoll, „das haben wir gesungen",
   * und daran erinnert sich jede:r gleich gut. Genau deshalb hängt es **nicht**
   * an `readOnly`: an einem vergangenen Abend ist das Abhaken erwünscht.
   */
  mayPick?: boolean;
}) {
  const songs = useMeetingSongs(meetingId);
  const [suggesting, setSuggesting] = useState(false);
  const [showRest, setShowRest] = useState(true);

  const all = songs.data ?? [];
  const setlist = all.filter((entry) => entry.isSelected);
  const rest = all.filter((entry) => !entry.isSelected);

  return (
    <section>
      <SectionTitle>{readOnly ? 'Gesungen' : 'Lieder'}</SectionTitle>
      <Card className="space-y-4">
        {songs.isLoading && <Skeleton className="h-16 w-full" />}

        {!songs.isLoading && all.length === 0 && (
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

        {setlist.length > 0 && (
          <div>
            <Heading icon={<ListMusic size={12} />}>
              Feste Setlist ({setlist.length})
            </Heading>
            <ul className="space-y-2">
              {setlist.map((entry) => (
                <SongRow
                  key={entry.id}
                  entry={entry}
                  meetingId={meetingId}
                  mayPick={mayPick}
                  mayDelete={!readOnly && editing}
                />
              ))}
            </ul>
          </div>
        )}

        {rest.length > 0 && (
          <div>
            {/* Aufklappbar, aber offen voreingestellt: Ein Vorschlag ist dazu
                da, gelesen zu werden. Zuklappen hilft erst, wenn die Setlist
                steht und die Liste darunter lang geworden ist. */}
            <button
              type="button"
              aria-expanded={showRest}
              onClick={() => setShowRest((value) => !value)}
              className="mb-3 flex w-full items-center gap-1.5 text-left"
            >
              <ChevronDown
                size={13}
                className={cn(
                  'shrink-0 text-terracotta-500 transition-transform',
                  showRest && 'rotate-180',
                )}
              />
              <span className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
                {setlist.length > 0 ? 'Weitere Vorschläge' : 'Vorschläge'} (
                {rest.length})
              </span>
            </button>

            {showRest && (
              <ul className="space-y-2">
                {rest.map((entry) => (
                  <SongRow
                    key={entry.id}
                    entry={entry}
                    meetingId={meetingId}
                    mayPick={mayPick}
                    mayDelete={!readOnly && editing}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {!readOnly && (
          <div className="border-t border-line pt-4">
            {/* Ein Knopf für eine Absicht. Was für ein Lied es ist — eines aus
                dem Archiv oder ein neues —, ist die zweite Frage und wird im
                Sheet gestellt. */}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setSuggesting(true)}
            >
              <Plus size={14} />
              Lied vorschlagen
            </Button>

            {/* Die Auskunft von der Leserseite her: nicht „du darfst nicht",
                sondern „dafür ist jemand zuständig". */}
            {!mayPick && all.length > 0 && (
              <p className="mt-3 text-center text-[11px] text-stone-400">
                Das Musik-Team wählt aus diesen Vorschlägen die finale Setlist.
              </p>
            )}
          </div>
        )}
      </Card>

      <SongSuggestSheet
        open={suggesting}
        onClose={() => setSuggesting(false)}
        meetingId={meetingId}
        alreadyPicked={all.map((entry) => entry.song.id)}
      />
    </section>
  );
}

function Heading({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
      {icon}
      {children}
    </h3>
  );
}

function SongRow({
  entry,
  meetingId,
  mayPick,
  mayDelete,
}: {
  entry: MeetingSong;
  meetingId: string;
  mayPick: boolean;
  mayDelete: boolean;
}) {
  const select = useSetMeetingSongSelected(meetingId);
  const remove = useRemoveMeetingSong(meetingId);

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-md border p-3',
        entry.isSelected
          ? 'border-terracotta-100 bg-terracotta-50/40'
          : 'border-line bg-card',
      )}
    >
      {mayPick && (
        <button
          type="button"
          aria-pressed={entry.isSelected}
          aria-label={
            entry.isSelected
              ? 'Aus der Setlist nehmen'
              : 'In die Setlist aufnehmen'
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
              ? 'border-terracotta-500 bg-terracotta-500 text-white'
              : 'border-line-strong text-transparent hover:border-terracotta-400',
          )}
        >
          <Check size={14} strokeWidth={3} />
        </button>
      )}

      {!mayPick && !entry.isSelected && (
        <Music size={15} className="shrink-0 text-stone-300" />
      )}

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

      {mayDelete && (
        <IconButton
          label="Lied entfernen"
          onClick={() => remove.mutate(entry.id)}
        >
          <Trash2 size={15} />
        </IconButton>
      )}
    </li>
  );
}
