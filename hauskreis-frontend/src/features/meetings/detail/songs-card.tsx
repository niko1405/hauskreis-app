'use client';

/**
 * Lieder eines Termins — **die Setlist und die Vorschläge, als zwei Karten.**
 *
 * Es war einmal eine Liste, dann eine Karte mit zwei Abschnitten. Jetzt sind es
 * zwei Karten, weil es zwei Fragen mit zwei verschiedenen Ordnungen sind:
 * „in welcher Folge singen wir" entscheidet das Musik-Team, „was wollen die
 * anderen" sagen die Stimmen. Eine Reihenfolge, die jemand gemacht hat, und
 * eine, die sich aus Zahlen ergibt, nebeneinander in einer Karte, sahen aus wie
 * eine Liste mit einem Bruch in der Mitte.
 *
 * **Die Setlist steht auch dann da, wenn sie leer ist** — sobald es überhaupt
 * Lieder gibt. Sie erschien zuerst erst mit dem ersten Haken, und damit fehlte
 * die Frage genau in dem Zustand, in dem sie offen ist. Was an ihrer Stelle
 * steht, hängt daran, wer liest: für das Musik-Team eine Aufforderung, für
 * alle anderen eine Auskunft.
 *
 * **Wer was darf, ist an der Zeile zu sehen und nicht an ausgegrauten Knöpfen.**
 * Das Musik-Team hat gefüllte Nummern, einen Griff und den Kreis zum
 * Übernehmen; alle anderen sehen umrandete Nummern und sonst nichts davon. Ein
 * toter Knopf ist kein Hinweis, sondern ein Fehler.
 *
 * **Bearbeiten darf jede:r**, an der Setlist wie an den Vorschlägen — gemeint
 * ist der kaputte Link, den irgendwer beim Üben bemerkt. Er gehört dem Lied und
 * nicht dem Abend; wer ihn repariert, repariert ihn überall.
 *
 * **Warum die Setlist terracotta ist.** „Im Set" ist eine **Auswahl**, und
 * Auswahl ist überall terracotta: der aktive Tab, der gewählte Chip, der erste
 * Platz einer Rangliste.
 */
import {
  ChevronDown,
  ChevronUp,
  Equal,
  Minus,
  Music,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Card, SectionTitle } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { PRESSABLE } from '@/components/ui/button';
import {
  useMeetingSongs,
  useRemoveMeetingSong,
  useReorderSetlist,
  useSetMeetingSongSelected,
  useVoteMeetingSong,
} from '@/lib/api/hooks';
import { LyricsLink } from '@/components/domain/lyrics-link';
import { SongSheet } from '@/components/domain/song-sheet';
import { SongSuggestSheet } from '@/components/domain/song-suggest-sheet';
import { SwipeActions } from '@/components/ui/swipe-actions';
import { cn } from '@/lib/cn';
import type { MeetingSong } from '@/lib/api/types';

type EditedSong = MeetingSong['song'];

export function SongsCard({
  meetingId,
  readOnly = false,
  mayPick = true,
}: {
  meetingId: string;
  /**
   * Ein vergangener oder abgesagter Abend: Vorschlagen, Löschen und Abstimmen
   * sind vorbei. **Die Setlist nicht** — sie hat ihre eigene Regel, siehe
   * `mayPick`.
   */
  readOnly?: boolean;
  /**
   * Ob die eigene Person die Setlist macht: übernehmen, ordnen, herausnehmen.
   *
   * Vor dem Abend nur, wer an dem Abend die Musik macht: Die Setlist ist dann
   * eine Entscheidung, „das singen wir", und die trifft, wer die Lieder übt.
   * Danach darf jede:r — dann ist es ein Protokoll, „das haben wir gesungen".
   * Genau deshalb hängt es **nicht** an `readOnly`.
   */
  mayPick?: boolean;
}) {
  const songs = useMeetingSongs(meetingId);
  const [suggesting, setSuggesting] = useState(false);
  const [editing, setEditing] = useState<EditedSong | null>(null);

  const all = songs.data ?? [];
  const setlist = all.filter((entry) => entry.isSelected);
  const rest = all.filter((entry) => !entry.isSelected);

  const suggest = !readOnly && (
    // Ein Knopf für eine Absicht. Was für ein Lied es ist — eines aus dem
    // Archiv oder ein neues —, ist die zweite Frage und wird im Sheet gestellt.
    <button
      type="button"
      onClick={() => setSuggesting(true)}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong py-3 text-sm font-semibold text-stone-400 transition-colors hover:border-terracotta-300 hover:text-terracotta-600',
        PRESSABLE,
      )}
    >
      <Plus size={16} />
      Neuen Song vorschlagen
    </button>
  );

  return (
    <section>
      <SectionTitle>{readOnly ? 'Gesungen' : 'Lieder'}</SectionTitle>

      {songs.isLoading && (
        <Card>
          <Skeleton className="h-16 w-full" />
        </Card>
      )}

      {!songs.isLoading && all.length === 0 && (
        <Card className="space-y-4">
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
          {suggest}
        </Card>
      )}

      {all.length > 0 && (
        <div className="space-y-4">
          <SetlistCard
            meetingId={meetingId}
            setlist={setlist}
            mayPick={mayPick}
            readOnly={readOnly}
            onEdit={setEditing}
          />

          {(rest.length > 0 || !readOnly) && (
            <SuggestionsCard
              meetingId={meetingId}
              rest={rest}
              mayPick={mayPick}
              readOnly={readOnly}
              onEdit={setEditing}
              footer={
                <>
                  {suggest}
                  {/* Die Auskunft von der Leserseite her: nicht „du darfst
                      nicht", sondern „dafür ist jemand zuständig". Steht die
                      leere Setlist oben, sagt sie dasselbe schon. */}
                  {!mayPick && setlist.length > 0 && rest.length > 0 && (
                    <p className="text-center text-[11px] text-stone-400">
                      Das Musik-Team wählt aus diesen Vorschlägen die finale
                      Setlist.
                    </p>
                  )}
                </>
              }
            />
          )}
        </div>
      )}

      <SongSuggestSheet
        open={suggesting}
        onClose={() => setSuggesting(false)}
        meetingId={meetingId}
        alreadyPicked={all.map((entry) => entry.song.id)}
      />

      {editing && (
        <SongSheet
          open
          onClose={() => setEditing(null)}
          song={editing}
          meetingId={meetingId}
        />
      )}
    </section>
  );
}

/** Symbol-Kästchen, Titel in Versalien, Unterzeile — der Kopf beider Karten. */
function CardHead({
  icon,
  title,
  subtitle,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone: 'selected' | 'muted';
}) {
  const selected = tone === 'selected';

  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
          selected
            ? 'border-terracotta-500/30 bg-terracotta-500/10 text-terracotta-500'
            : 'border-line bg-canvas text-stone-400',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block text-sm font-bold tracking-widest uppercase',
            selected ? 'text-terracotta-500' : 'text-stone-400',
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            'block text-[11px]',
            selected ? 'text-terracotta-500/80' : 'text-stone-400',
          )}
        >
          {subtitle}
        </span>
      </span>
    </div>
  );
}

function songCount(n: number): string {
  return n === 1 ? '1 Song' : `${n} Songs`;
}

// ------------------------------------------------------------------ Setlist

function SetlistCard({
  meetingId,
  setlist,
  mayPick,
  readOnly,
  onEdit,
}: {
  meetingId: string;
  setlist: MeetingSong[];
  mayPick: boolean;
  readOnly: boolean;
  onEdit: (song: EditedSong) => void;
}) {
  const reorder = useReorderSetlist(meetingId);
  const ids = setlist.map((entry) => entry.id);

  // Während des Ziehens gilt die eigene Reihenfolge, danach wieder die aus dem
  // Zwischenspeicher. Gespeichert wird einmal beim Loslassen und nicht bei
  // jedem Platztausch unterwegs — sonst gingen bei einem Zug über vier Plätze
  // vier Schreibvorgänge raus.
  const [dragged, setDragged] = useState<string[] | null>(null);
  const order = dragged ?? ids;
  const latest = useRef(order);
  useEffect(() => {
    latest.current = order;
  });

  const byId = new Map(setlist.map((entry) => [entry.id, entry]));

  const commit = () => {
    const next = latest.current;
    if (next.join() === ids.join()) {
      setDragged(null);
      return;
    }
    reorder.mutate(next, { onSettled: () => setDragged(null) });
  };

  return (
    // Der Schein ist Teil der Aussage: Diese Karte ist die Antwort auf die
    // Frage, mit der man hierherkommt, und sie soll aus der Seite treten.
    <div className="rounded-card border border-terracotta-500/40 bg-gradient-to-b from-terracotta-500/15 to-card p-4 shadow-[0_0_48px_-16px_color-mix(in_oklab,var(--color-terracotta-500)_55%,transparent)] sm:p-5">
      <CardHead
        icon={<Music size={18} />}
        title="Feste Setlist"
        subtitle={`${songCount(setlist.length)} ausgewählt`}
        tone="selected"
      />

      {setlist.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-terracotta-500/30 px-4 py-5 text-center">
          <p className="text-sm font-bold text-stone-700">
            {readOnly
              ? 'Nicht notiert, was gesungen wurde'
              : mayPick
                ? 'Noch nichts ausgewählt'
                : 'Die Setlist steht noch nicht fest'}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-400">
            {mayPick
              ? readOnly
                ? 'Tipp unten auf den Kreis vor einem Lied, das dran war — das hilft der Liederliste.'
                : 'Tippt unten auf den Kreis vor einem Vorschlag — er landet dann hier.'
              : 'Das Musik-Team wählt aus den Vorschlägen aus.'}
          </p>
        </div>
      ) : (
        <Reorder.Group
          as="ol"
          axis="y"
          values={order}
          onReorder={setDragged}
          className="mt-4 space-y-2.5"
        >
          {order.map((id, index) => {
            const entry = byId.get(id);
            if (!entry) return null;

            return (
              <SetlistRow
                key={id}
                entry={entry}
                number={index + 1}
                meetingId={meetingId}
                mayPick={mayPick}
                onEdit={onEdit}
                onDragEnd={commit}
              />
            );
          })}
        </Reorder.Group>
      )}
    </div>
  );
}

function SetlistRow({
  entry,
  number,
  meetingId,
  mayPick,
  onEdit,
  onDragEnd,
}: {
  entry: MeetingSong;
  number: number;
  meetingId: string;
  mayPick: boolean;
  onEdit: (song: EditedSong) => void;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();
  const select = useSetMeetingSongSelected(meetingId);
  const grip = useRef<HTMLSpanElement>(null);

  const takeOut = () =>
    select.mutate({ meetingSongId: entry.id, isSelected: false });

  // **Gezogen wird nur am Griff.** Die Zeile wischt schon nach links
  // (`SwipeActions`, `drag="x"`), und zwei Gesten auf derselben Fläche
  // bräuchten eine Regel, welche gewinnt — dieselbe Überlegung wie am Sheet.
  //
  // Als natives `pointerdown` und nicht über React: Die Wisch-Zeile darüber
  // hört ebenfalls nativ zu und bekäme den Druck sonst vor React mit — sie
  // finge an, waagerecht mitzugehen, während die Zeile nach oben gezogen wird.
  useEffect(() => {
    const node = grip.current;
    if (!node) return;

    const start = (event: PointerEvent) => {
      event.stopPropagation();
      controls.start(event);
    };
    node.addEventListener('pointerdown', start);
    return () => node.removeEventListener('pointerdown', start);
  }, [controls]);

  const row = (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-canvas p-3">
      {/* Die Nummer — und für das Musik-Team beim Überfahren der Knopf, der
          das Lied zurück zu den Vorschlägen schickt. Nur mit einem Zeiger,
          der wirklich schweben kann: Ein Telefon kennt kein Überfahren, und
          ein Antippen sollte hier nicht schon etwas entfernen. Dort ist der
          Wisch der Weg. */}
      <span className="group/num relative shrink-0">
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full font-serif text-sm font-bold',
            mayPick
              ? 'bg-terracotta-500 text-white'
              : 'border border-terracotta-500/40 bg-terracotta-500/10 text-terracotta-500',
          )}
        >
          {number}
        </span>
        {mayPick && (
          <button
            type="button"
            aria-label={`${entry.song.title} aus der Setlist nehmen`}
            title="Aus der Setlist nehmen"
            onClick={takeOut}
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-terracotta-500 text-white opacity-0 transition-opacity focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:hover)]:group-hover/num:pointer-events-auto [@media(hover:hover)]:group-hover/num:opacity-100"
          >
            <Minus size={16} strokeWidth={3} />
          </button>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-stone-800">
          {entry.song.title}
        </p>
        <p className="truncate text-[11px] text-stone-400">
          {entry.song.artist ?? 'Unbekannt'}
        </p>
      </div>

      {mayPick && (
        <span
          ref={grip}
          role="button"
          tabIndex={-1}
          aria-label={`${entry.song.title} verschieben`}
          className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-stone-400 active:cursor-grabbing"
        >
          <Equal size={18} />
        </span>
      )}

      <LyricsLink url={entry.song.lyricsUrl} title={entry.song.title} />
    </div>
  );

  return (
    <Reorder.Item
      value={entry.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="relative"
    >
      <SwipeActions
        className="rounded-2xl"
        actions={[
          {
            icon: <Pencil size={14} />,
            label: `${entry.song.title} bearbeiten`,
            onClick: () => onEdit(entry.song),
          },
          ...(mayPick
            ? [
                {
                  icon: <Minus size={16} />,
                  label: `${entry.song.title} aus der Setlist nehmen`,
                  tone: 'danger' as const,
                  disabled: select.isPending,
                  onClick: takeOut,
                },
              ]
            : []),
        ]}
      >
        {row}
      </SwipeActions>
    </Reorder.Item>
  );
}

// -------------------------------------------------------------- Vorschläge

function SuggestionsCard({
  meetingId,
  rest,
  mayPick,
  readOnly,
  onEdit,
  footer,
}: {
  meetingId: string;
  rest: MeetingSong[];
  mayPick: boolean;
  readOnly: boolean;
  onEdit: (song: EditedSong) => void;
  footer: React.ReactNode;
}) {
  // Aufklappbar, aber offen voreingestellt: Ein Vorschlag ist dazu da,
  // gelesen zu werden. Zuklappen hilft erst, wenn die Setlist steht und die
  // Liste darunter lang geworden ist.
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-4 rounded-card border border-line bg-card p-4 sm:p-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="block w-full text-left"
      >
        <CardHead
          icon={
            <ChevronDown
              size={18}
              className={cn('transition-transform', !open && '-rotate-90')}
            />
          }
          title="Weitere Vorschläge"
          subtitle={`${songCount(rest.length)} in der Liste`}
          tone="muted"
        />
      </button>

      {open && rest.length > 0 && (
        <ul className="space-y-2.5">
          {rest.map((entry) => (
            <SuggestionRow
              key={entry.id}
              entry={entry}
              meetingId={meetingId}
              mayPick={mayPick}
              readOnly={readOnly}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}

      {footer}
    </div>
  );
}

function SuggestionRow({
  entry,
  meetingId,
  mayPick,
  readOnly,
  onEdit,
}: {
  entry: MeetingSong;
  meetingId: string;
  mayPick: boolean;
  readOnly: boolean;
  onEdit: (song: EditedSong) => void;
}) {
  const select = useSetMeetingSongSelected(meetingId);
  const remove = useRemoveMeetingSong(meetingId);
  const vote = useVoteMeetingSong(meetingId);

  const row = (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-canvas p-3">
      {mayPick && (
        <button
          type="button"
          aria-label={`${entry.song.title} in die Setlist aufnehmen`}
          title="In die Setlist aufnehmen"
          onClick={() =>
            select.mutate({ meetingSongId: entry.id, isSelected: true })
          }
          className="h-8 w-8 shrink-0 rounded-full border border-line-strong transition-colors hover:border-terracotta-400 hover:bg-terracotta-500/10"
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-stone-800">
          {entry.song.title}
        </p>
        <p className="truncate text-[11px] text-stone-400">
          {entry.song.artist ?? 'Unbekannt'}
        </p>
      </div>

      <VotePill
        votes={entry.votes}
        votedByMe={entry.votedByMe}
        disabled={readOnly}
        title={entry.song.title}
        onToggle={() =>
          vote.mutate({ meetingSongId: entry.id, voted: !entry.votedByMe })
        }
      />

      <LyricsLink url={entry.song.lyricsUrl} title={entry.song.title} />
    </div>
  );

  return (
    <li>
      <SwipeActions
        className="rounded-2xl"
        actions={[
          {
            icon: <Pencil size={14} />,
            label: `${entry.song.title} bearbeiten`,
            onClick: () => onEdit(entry.song),
          },
          // Einen Vorschlag darf jede:r löschen — er ist ein Wunsch, und wer
          // sich vertan hat, soll ihn wieder loswerden. Nur am vergangenen
          // Abend nicht mehr: dort ist die Liste ein Protokoll.
          ...(readOnly
            ? []
            : [
                {
                  icon: <Trash2 size={14} />,
                  label: `${entry.song.title} löschen`,
                  tone: 'danger' as const,
                  disabled: remove.isPending,
                  onClick: () => remove.mutate(entry.id),
                },
              ]),
        ]}
      >
        {row}
      </SwipeActions>
    </li>
  );
}

/**
 * „^ 3" — wie sehr die anderen das singen wollen, und ob man selbst dabei ist.
 *
 * Gefüllt heißt: meine Stimme ist dabei. Ein zweiter Tipp nimmt sie zurück.
 * Am vergangenen Abend bleibt nur die Zahl stehen, ohne Knopf — und ohne
 * Stimmen gar nichts, eine Null wäre dort keine Auskunft.
 */
function VotePill({
  votes,
  votedByMe,
  disabled,
  title,
  onToggle,
}: {
  votes: number;
  votedByMe: boolean;
  disabled: boolean;
  title: string;
  onToggle: () => void;
}) {
  const classes = cn(
    'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-bold tabular-nums transition-colors',
    votedByMe
      ? 'border-terracotta-500/60 bg-terracotta-500/15 text-terracotta-500'
      : 'border-line-strong text-stone-500',
  );

  if (disabled) {
    if (votes === 0) return null;
    return (
      <span className={classes} title={`${votes} Stimmen`}>
        <ChevronUp size={14} strokeWidth={3} />
        {votes}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={votedByMe}
      aria-label={
        votedByMe
          ? `Stimme für ${title} zurücknehmen (${votes})`
          : `Für ${title} stimmen (${votes})`
      }
      onClick={onToggle}
      className={cn(
        classes,
        PRESSABLE,
        !votedByMe && 'hover:border-terracotta-400 hover:text-terracotta-500',
      )}
    >
      <ChevronUp size={14} strokeWidth={3} />
      {votes}
    </button>
  );
}
