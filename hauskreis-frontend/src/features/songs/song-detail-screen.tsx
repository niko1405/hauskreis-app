'use client';

/**
 * Ein Lied für sich — `/lied?id=<uuid>`, vom Termin aus mit `&termin=<uuid>`.
 *
 * Ein Lied hatte lange keinen eigenen Ort: Es war eine Zeile mit einem
 * „Text"-Knopf, und Bearbeiten und Löschen lagen hinter einem Wisch. Seit es
 * eine eigene Version gibt, trägt ein Lied mehr, als eine Zeile tragen kann —
 * den Link nach draußen, das eigene Blatt, das Vollbild, die Zahlen. Also eine
 * Seite, und jede Liedzeile führt hierher.
 *
 * **Oben, was alle sehen, darunter, was nur dir gehört.** Titel, Zahlen und der
 * Link sind Sache der Gruppe. „Deine Version" liegt nur in diesem Gerät
 * (`lib/own-songs/store.ts`), und die Seite sagt das an der Stelle, an der es
 * gilt.
 *
 * **Lesen ist der Normalfall**, wie auf der Themenseite. Was man ändert —
 * Angaben, die eigene Version, das Löschen —, steht hinter „Bearbeiten".
 * Gespeichert wird dort trotzdem gezielt: die Angaben mit einem Knopf, alles
 * andere sofort.
 *
 * **Unten steht ein Balken statt der Tab-Leiste** (`EditBar`), wie am
 * vergangenen Termin: „Bearbeiten" für jede:r, und kam man vom Termin, daneben
 * „Entfernen" — ohne Umweg über den Bearbeitungsmodus, denn ein Lied von einem
 * Abend zu nehmen ist eine Entscheidung über den Abend und keine Änderung am
 * Lied. Vom Termin aus wird deshalb auch nichts **gelöscht**; das geht nur aus
 * dem Archiv.
 *
 * **Vom Termin aus blättert man durch den Abend** (`useEveningPager`): oben
 * rechts „‹ Setlist · Platz 2 ›", auf dem Telefon auch per Wisch. Durch die
 * Setlist, wenn man aus ihr kam, sonst durch die Vorschläge — es sind zwei
 * Listen mit zwei Ordnungen, und wer die Setlist durchgeht, will nicht
 * zwischen die Vorschläge geraten. Geblättert wird mit `replace`: „Zurück"
 * führt danach auf den Termin und nicht durch jedes Lied, das man gesehen hat.
 */
import {
  AlignLeft,
  ChevronLeft,
  ChevronRight,
  Guitar,
  ExternalLink,
  FileMusic,
  Info,
  Link2,
  Lock,
  Maximize2,
  Minus,
  Music2,
  Pencil,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BackButton } from '@/components/layout/back-button';
import { EditBar } from '@/components/layout/edit-bar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useUnsavedGuard } from '@/components/ui/unsaved';
import {
  ChordSheetView,
  type SheetMode,
} from '@/components/domain/chord-sheet-view';
import { isHttpUrl } from '@/components/domain/lyrics-link';
import {
  SongFields,
  songInput,
  type SongFieldValues,
} from '@/components/domain/song-fields';
import { errorMessage, isStatus } from '@/lib/api/errors';
import {
  useDeleteSong,
  useHk,
  useMe,
  useMeeting,
  useMeetingSongs,
  useRemoveMeetingSong,
  useSetMeetingSongSelected,
  useSong,
  useSongLeaders,
  useUpdateSong,
} from '@/lib/api/hooks';
import { hasChords, parseSheet, transposer } from '@/lib/chords';
import { cn } from '@/lib/cn';
import { formatDay } from '@/lib/date';
import { isMeetingPast, mayPickSongs } from '@/lib/meeting';
import {
  useOwnSong,
  useRemoveOwnSong,
  useSaveOwnSong,
  useUpdateOwnSong,
} from '@/lib/own-songs/use-own-songs';
import type { OwnSong } from '@/lib/own-songs/store';
import type { MeetingSong, Song } from '@/lib/api/types';
import { OwnVersionEditor } from './own-version-editor';
import { SheetFullscreen } from './sheet-fullscreen';

export function SongDetailScreen({
  songId,
  meetingId,
}: {
  songId: string;
  /** Kam man vom Termin, gibt es dort eine Rolle und einen Weg zurück. */
  meetingId: string | null;
}) {
  const query = useSong(songId);
  const own = useOwnSong(songId);

  // Auch auf die eigene Version warten: Sonst stünde für einen Augenblick
  // „Hinterleg dir Text & Akkorde" da, wo gleich das eigene Blatt steht.
  if (query.isLoading || own.isLoading) {
    return (
      <div className="space-y-4 px-5 pt-safe-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  // Ein Lied, das es in der Liederliste nicht mehr gibt — die eigene Version
  // liegt trotzdem noch im Gerät. Sie bleibt lesbar und lässt sich entfernen.
  if (query.error && isStatus(query.error, 404) && own.song) {
    return <Orphaned own={own.song} />;
  }

  if (query.error) {
    return (
      <div className="space-y-4 px-5 pt-safe-4">
        <BackButton fallback="/archiv?register=lieder" />
        <ErrorState error={query.error} />
      </div>
    );
  }

  if (!query.data) return null;

  return <Loaded song={query.data.data} own={own.song} meetingId={meetingId} />;
}

function Loaded({
  song,
  own,
  meetingId,
}: {
  song: Song;
  own: OwnSong | null;
  meetingId: string | null;
}) {
  const confirm = useConfirm();
  const updateOwn = useUpdateOwnSong();

  const [editing, setEditing] = useState(false);
  const [fieldsDirty, setFieldsDirty] = useState(false);

  // Titel und Interpret der eigenen Version nachziehen: „Meine Lieder" liest
  // sie ohne Netz, und dort soll stehen, wie das Lied heute heißt.
  const ownTitle = own?.title;
  const ownArtist = own?.artist;
  const mutateOwn = updateOwn.mutate;
  useEffect(() => {
    if (ownTitle === undefined) return;
    if (ownTitle === song.title && ownArtist === song.artist) return;
    mutateOwn({
      songId: song.id,
      settings: { title: song.title, artist: song.artist },
    });
  }, [ownTitle, ownArtist, song.id, song.title, song.artist, mutateOwn]);

  const toggleEditing = async () => {
    if (editing && fieldsDirty) {
      const ok = await confirm({
        title: 'Änderungen verwerfen?',
        body: 'Titel, Interpret oder Link sind geändert, aber noch nicht gespeichert.',
        confirmLabel: 'Verwerfen',
        tone: 'danger',
      });
      if (!ok) return;
      setFieldsDirty(false);
    }
    setEditing((current) => !current);
  };

  const facts = [
    song.artist ?? 'Interpret unbekannt',
    song.timesPlayed > 0
      ? `${song.timesPlayed}× gesungen`
      : 'noch nie gesungen',
    song.lastPlayedAt && `zuletzt ${formatDay(song.lastPlayedAt)}`,
  ].filter(Boolean);

  const onToggle = () => void toggleEditing();

  const pager = useEveningPager(meetingId, song.id);
  const root = useRef<HTMLDivElement>(null);
  // Beim Bearbeiten wird nicht geblättert: Was in den Feldern steht, gehört
  // zu diesem Lied, und ein Wisch nähme es stillschweigend mit.
  useHorizontalSwipe(root, {
    enabled: !editing,
    onNext: pager.next ? pager.goNext : undefined,
    onPrevious: pager.previous ? pager.goPrevious : undefined,
  });

  // Ein geblättertes Lied kommt aus der Richtung herein, in die man wollte.
  // Als Web Animation ohne `fill`: Danach bleibt kein `transform` am Kasten
  // stehen — sonst wären Editor und Vollbild darin an ihn gebunden statt an
  // den Bildschirm.
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const step = entering;
    if (step === 0) return;
    entering = 0;
    // Nur die Adresse ändert sich, die Seite bleibt — und damit auch, wie
    // weit sie gescrollt war. Das nächste Lied fängt oben an.
    window.scrollTo(0, 0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    content.current?.animate(
      [
        { transform: `translateX(${step * 48}px)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }, [song.id]);

  return (
    <div ref={root} className="space-y-6 px-5 pt-safe-4 pb-10">
      <div className="flex items-center justify-between gap-2">
        <BackButton
          fallback={
            meetingId ? `/termin?id=${meetingId}` : '/archiv?register=lieder'
          }
        />
        <EveningPager pager={pager} navigable={!editing} />
      </div>

      <div ref={content} className="space-y-6">
        <header>
          <p className="text-[11px] font-bold tracking-widest text-stone-400 uppercase">
            Lied
          </p>
          <h1 className="mt-1 font-serif text-3xl leading-tight font-bold text-stone-900">
            {song.title}
          </h1>
          <p className="mt-1 text-sm text-stone-400">{facts.join(' · ')}</p>
        </header>

        {editing ? (
          <EditFields
            song={song}
            meetingId={meetingId}
            onDirty={setFieldsDirty}
          />
        ) : (
          <SourceLink url={song.lyricsUrl} />
        )}

        <OwnVersion
          song={song}
          own={own}
          editing={editing}
          onRequestEdit={() => setEditing(true)}
        />

        {editing && !meetingId && <DeleteSong song={song} own={own} />}
      </div>

      {meetingId ? (
        <EveningBar
          meetingId={meetingId}
          songId={song.id}
          editing={editing}
          onToggle={onToggle}
        />
      ) : (
        <EditBar editing={editing} onToggle={onToggle} />
      )}
    </div>
  );
}

// ------------------------------------------------------------ Kopf & Link

/**
 * Woher ein geblättertes Lied kommt — gesetzt vor dem Blättern, gelesen und
 * zurückgesetzt beim Erscheinen. Ein Wert am Modul statt in der Adresse: Er
 * gilt für genau einen Wechsel, und ein Neuladen soll nicht hereinrutschen.
 */
let entering: -1 | 0 | 1 = 0;

/**
 * Das Lied in seiner Liste am Abend — und die Nachbarn darin.
 *
 * Die Liste ist die, in der es steht: die Setlist in ihrer Reihenfolge, die
 * Vorschläge nach Stimmen, so wie am Termin. Die Nachbarn werden vorgeladen,
 * damit ein Wisch das nächste Lied zeigt und keinen Ladekasten.
 */
function useEveningPager(meetingId: string | null, songId: string) {
  const router = useRouter();
  const songs = useMeetingSongs(meetingId ?? undefined);

  const all = songs.data ?? [];
  const entry = all.find((item) => item.song.id === songId);
  const list = entry
    ? all.filter((item) => item.isSelected === entry.isSelected)
    : [];
  const index = entry ? list.indexOf(entry) : -1;
  const previous = index > 0 ? list[index - 1] : undefined;
  const next = index >= 0 ? list[index + 1] : undefined;

  useSong(previous?.song.id);
  useSong(next?.song.id);

  const go = (target: MeetingSong | undefined, step: -1 | 1) => {
    if (!target || !meetingId) return;
    entering = step;
    router.replace(`/lied?id=${target.song.id}&termin=${meetingId}`);
  };

  return {
    entry,
    place: index + 1,
    total: list.length,
    previous,
    next,
    goPrevious: () => go(previous, -1),
    goNext: () => go(next, 1),
  };
}

type EveningPagerState = ReturnType<typeof useEveningPager>;

/**
 * Oben rechts: „‹ Setlist · Platz 2 ›" oder „‹ Vorschlag · 3 Stimmen ›".
 *
 * Das Abzeichen stand unter dem Titel und war dort eine Auskunft; neben den
 * Pfeilen ist es die Antwort auf „wo bin ich gerade". Die Pfeile gibt es nur,
 * wenn es etwas zu blättern gibt, und nicht beim Bearbeiten.
 */
function EveningPager({
  pager,
  navigable,
}: {
  pager: EveningPagerState;
  navigable: boolean;
}) {
  const { entry, place, total, previous, next } = pager;
  if (!entry) return null;

  const arrows = navigable && total > 1;
  const label = entry.isSelected
    ? `Setlist · Platz ${place}`
    : `Vorschlag · ${entry.votes} ${entry.votes === 1 ? 'Stimme' : 'Stimmen'}`;

  return (
    <div
      role="group"
      aria-label={`Lied ${place} von ${total} ${entry.isSelected ? 'in der Setlist' : 'bei den Vorschlägen'}`}
      className="flex items-center gap-1"
    >
      {arrows && (
        <IconButton
          label="Voriges Lied"
          disabled={!previous}
          onClick={pager.goPrevious}
          className="disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft size={18} />
        </IconButton>
      )}
      <Badge variant={entry.isSelected ? 'terracotta' : 'neutral'}>
        {label}
      </Badge>
      {arrows && (
        <IconButton
          label="Nächstes Lied"
          disabled={!next}
          onClick={pager.goNext}
          className="disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight size={18} />
        </IconButton>
      )}
    </div>
  );
}

/**
 * Ein waagerechter Wisch auf dem Telefon: nach links das nächste Lied, nach
 * rechts das vorige.
 *
 * Mit eigenen Touch-Ereignissen und nicht mit Motion: Es bewegt sich dabei
 * nichts unter dem Finger, gefragt ist nur, ob ein Wisch gemeint war — weit
 * genug, deutlich mehr waagerecht als senkrecht, und nicht zu langsam. Was in
 * einer Ebene darüber passiert (Editor, Vollbild, Sheet), zählt nicht: Dort
 * ziehen Finger Akkorde und Leisten. Und nichts vom linken Rand, dort liegt
 * die Geste „zurück" des Systems.
 */
function useHorizontalSwipe(
  ref: React.RefObject<HTMLElement | null>,
  handlers: {
    enabled: boolean;
    onNext?: () => void;
    onPrevious?: () => void;
  },
) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let start: { x: number; y: number; time: number } | null = null;

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const target = event.target as Element | null;
      start =
        event.touches.length === 1 &&
        touch &&
        latest.current.enabled &&
        touch.clientX > 24 &&
        !target?.closest('[role="dialog"], input, textarea')
          ? { x: touch.clientX, y: touch.clientY, time: event.timeStamp }
          : null;
    };

    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const slow = event.timeStamp - start.time > 700;
      start = null;

      if (slow || Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (dx < 0) latest.current.onNext?.();
      else latest.current.onPrevious?.();
    };

    const onCancel = () => {
      start = null;
    };

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchend', onEnd, { passive: true });
    node.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onCancel);
    };
  }, [ref]);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Der Weg nach draußen — oben, weil er die erste Frage beantwortet. */
function SourceLink({ url }: { url: string | null }) {
  if (!isHttpUrl(url)) {
    return (
      <p className="flex items-center gap-2 text-xs text-stone-400">
        <Link2 size={13} />
        Noch kein Link zum Liedtext — unter „Bearbeiten" ergänzen.
      </p>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-card border border-line bg-card p-4 transition-colors hover:border-terracotta-400"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-terracotta-50 text-terracotta-600">
        <Link2 size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-stone-800">
          Zum Liedtext
        </span>
        <span className="block truncate text-[11px] text-stone-400">
          {hostOf(url)}
        </span>
      </span>
      <ExternalLink size={16} className="shrink-0 text-terracotta-600" />
    </a>
  );
}

// ---------------------------------------------------------- Deine Version

function PrivateNote() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-terracotta-600">
      <Lock size={11} />
      Nur für dich
    </span>
  );
}

/**
 * Die eigene Version — zum Lesen als Text.
 *
 * Text und nicht Akkorde, weil man hier meistens nachliest; wer spielt, nimmt
 * das Vollbild, und dort stehen die Akkorde vorn. Die Umschaltung merkt sich
 * nichts: Sie ist ein Blick, keine Einstellung.
 */
function OwnVersion({
  song,
  own,
  editing,
  onRequestEdit,
}: {
  song: Song;
  own: OwnSong | null;
  editing: boolean;
  /** Ohne Link gibt es keine eigene Version — der Weg dorthin ist „Bearbeiten". */
  onRequestEdit: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const save = useSaveOwnSong();
  const update = useUpdateOwnSong();
  const remove = useRemoveOwnSong();

  const [editor, setEditor] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<SheetMode>('text');

  const sheet = useMemo(
    () => (own ? parseSheet(own.text, { format: 'chordpro' }) : null),
    [own],
  );
  const shift = useMemo(
    () => (sheet ? transposer(sheet, own?.transpose ?? 0) : null),
    [sheet, own?.transpose],
  );

  const removeVersion = async () => {
    const ok = await confirm({
      title: 'Deine Version entfernen?',
      body: 'Text und Akkorde sind dann von diesem Gerät weg. Eine Sicherung davon gibt es nicht.',
      confirmLabel: 'Entfernen',
      tone: 'danger',
    });
    if (!ok) return;
    remove.mutate(song.id, {
      onSuccess: () => toast.success('Deine Version ist entfernt.'),
      onError: (error) => toast.error(error.message),
    });
  };

  const linked = isHttpUrl(song.lyricsUrl);
  const key = own?.key ?? null;
  const transposed = own !== null && own.transpose !== 0 && Boolean(shift?.key);
  const shownKey = transposed ? (shift?.key ?? null) : key;

  return (
    <section>
      <SectionTitle action={<PrivateNote />}>Deine Version</SectionTitle>

      {own && sheet && shift ? (
        <Card className="p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {hasChords(sheet) && !editing && (
              <ModeSwitch value={mode} onChange={setMode} />
            )}
            {shownKey && (
              <KeyBadge
                tonart={shownKey}
                original={transposed ? (key ?? '?') : null}
              />
            )}
            {own.capo && <Badge>Kapo {own.capo}</Badge>}
            {editing ? (
              <span className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditor(true)}
                >
                  <Pencil size={13} /> Ändern
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void removeVersion()}
                >
                  <Trash2 size={13} /> Entfernen
                </Button>
              </span>
            ) : (
              // Auf dem Telefon nur das Symbol, dafür groß: Es ist der eine
              // Knopf der Karte, den man mit dem Instrument in der Hand trifft.
              <>
                <IconButton
                  label="Vollbild"
                  onClick={() => setFullscreen(true)}
                  className="ml-auto size-11 border border-line bg-card text-terracotta-600 hover:text-terracotta-700 sm:hidden"
                >
                  <Maximize2 size={22} />
                </IconButton>
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-auto hidden sm:inline-flex"
                  onClick={() => setFullscreen(true)}
                >
                  <Maximize2 size={13} /> Vollbild
                </Button>
              </>
            )}
          </div>
          <ChordSheetView
            sheet={sheet}
            chord={shift.chord}
            mode={editing ? 'chords' : mode}
          />
        </Card>
      ) : (
        <Card className="flex flex-col items-center p-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-terracotta-50 text-terracotta-600">
            <FileMusic size={20} />
          </span>
          <p className="mt-3 font-serif text-lg font-bold text-stone-900">
            Hinterleg dir Text & Akkorde
          </p>
          {/* Ohne Link kein Editor: Was in einer eigenen Version steht, kommt
              von der verlinkten Seite, und ihr erster Schritt zeigte sonst ins
              Leere. */}
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-stone-500">
            {linked
              ? 'Liedtext öffnen, alles kopieren, hier einfügen — die App erkennt die Akkorde. Die Version bleibt auf diesem Gerät, niemand sonst sieht sie.'
              : 'Trag zuerst einen Link zum Liedtext ein — von dort kopierst du Text & Akkorde.'}
          </p>
          {linked ? (
            <Button className="mt-4" onClick={() => setEditor(true)}>
              <Lock size={14} />
              Eigene Version anlegen
            </Button>
          ) : (
            !editing && (
              <Button
                className="mt-4"
                variant="secondary"
                onClick={onRequestEdit}
              >
                <Link2 size={14} />
                Link eintragen
              </Button>
            )
          )}
        </Card>
      )}

      {editor && (
        <OwnVersionEditor
          song={song}
          initialText={own?.text}
          saving={save.isPending}
          onSave={(result) =>
            save.mutate(
              {
                songId: song.id,
                title: song.title,
                artist: song.artist,
                ...result,
              },
              {
                onSuccess: () => {
                  toast.success(
                    own
                      ? 'Gespeichert.'
                      : 'Gespeichert — nur auf diesem Gerät.',
                  );
                  setEditor(false);
                },
                onError: (error) => toast.error(error.message),
              },
            )
          }
          onClose={() => setEditor(false)}
        />
      )}

      {fullscreen && own && sheet && (
        <SheetFullscreen
          title={song.title}
          artist={song.artist}
          sheet={sheet}
          transpose={own.transpose}
          scrollSpeed={own.scrollSpeed}
          voicings={own.voicings ?? {}}
          onSettings={(settings) =>
            update.mutate({ songId: song.id, settings })
          }
          onClose={() => setFullscreen(false)}
        />
      )}
    </section>
  );
}

// ------------------------------------------------------- Bearbeitungsmodus

function fieldsOf(song: Song): SongFieldValues {
  return {
    title: song.title,
    artist: song.artist ?? '',
    lyricsUrl: song.lyricsUrl ?? '',
  };
}

/**
 * Titel, Interpret und Link — für alle, wie bisher. Er gehört dem Lied und
 * nicht dem Abend; wer einen kaputten Link repariert, repariert ihn überall.
 */
function EditFields({
  song,
  meetingId,
  onDirty,
}: {
  song: Song;
  meetingId: string | null;
  onDirty: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { keys } = useHk();
  const toast = useToast();
  const update = useUpdateSong(song.id);

  const [values, setValues] = useState<SongFieldValues>(() => fieldsOf(song));

  // Ein neuer Stand vom Server — der eigene nach dem Speichern oder ein
  // fremder nach einem Konflikt — kommt in die Felder. Am Stand und nicht am
  // Objekt: Ein bloßes Nachladen im Hintergrund soll nichts überschreiben, was
  // gerade getippt wird.
  const [shown, setShown] = useState(song.version);
  if (song.version !== shown) {
    setShown(song.version);
    setValues(fieldsOf(song));
  }

  const input = songInput(values);
  const dirty =
    input.title !== song.title ||
    input.artist !== song.artist ||
    input.lyricsUrl !== song.lyricsUrl;

  useUnsavedGuard(dirty);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  const save = () =>
    update.mutate(input, {
      onSuccess: () => {
        // Die Liederliste des Termins hat ihren eigenen Zwischenspeicher; ohne
        // den Hinweis stünde dort weiter der alte Titel.
        if (meetingId) {
          void queryClient.invalidateQueries({
            queryKey: keys.meetings.songs(meetingId),
          });
        }
        toast.success('Gespeichert.');
      },
    });

  return (
    <section>
      <SectionTitle>Angaben</SectionTitle>
      <Card className="space-y-4">
        {update.conflict && (
          <ConflictBanner onResolve={update.resolveConflict} />
        )}
        <SongFields
          values={values}
          onChange={(patch) =>
            setValues((current) => ({ ...current, ...patch }))
          }
        />
        {song.timesPlayed > 0 && (
          <p className="text-[11px] text-stone-400">
            {song.timesPlayed}× gesungen — eine Änderung gilt auch für diese
            Abende.
          </p>
        )}
        {dirty && (
          <Button
            className="w-full"
            loading={update.isPending}
            disabled={input.title === ''}
            onClick={save}
          >
            Speichern
          </Button>
        )}
      </Card>
    </section>
  );
}

/**
 * Der Balken unten, wenn man vom Termin kam — „Bearbeiten" und daneben
 * „Entfernen", sofern man es darf.
 *
 * **Ein Lied aus der Setlist** nimmt nur heraus, wer es hineinstellen darf
 * (`mayPickSongs`, dieselbe Regel wie am Termin), und wird gefragt, wohin:
 * zurück zu den Vorschlägen, samt Stimmen, oder ganz weg vom Abend. Beides ist
 * gemeint, und welches, weiß nur, wer drückt. **Ein Vorschlag** darf jede:r
 * entfernen — ein Wunsch, den man wieder loswerden darf —, außer am
 * vergangenen oder abgesagten Abend: dort ist die Liste ein Protokoll.
 *
 * Das Sheet für die Frage steht hier und nicht im Balken: Der hängt im Fuß des
 * Gerüsts, und dessen `backdrop-blur` wäre der Bezugsrahmen eines festen
 * Panels darin.
 */
function EveningBar({
  meetingId,
  songId,
  editing,
  onToggle,
}: {
  meetingId: string;
  songId: string;
  editing: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const me = useMe();
  const meeting = useMeeting(meetingId);
  const leaders = useSongLeaders(meetingId);
  const songs = useMeetingSongs(meetingId);
  const select = useSetMeetingSongSelected(meetingId);
  const remove = useRemoveMeetingSong(meetingId);
  const [choosing, setChoosing] = useState(false);

  const entry = songs.data?.find((item) => item.song.id === songId);
  const data = meeting.data?.data;

  const cancelled = data?.status === 'CANCELLED';
  const past = data ? isMeetingPast(data) : false;
  const mayPick =
    data !== undefined &&
    mayPickSongs({
      cancelled,
      past,
      leaders: leaders.data ?? [],
      meId: me.me?.id,
    });

  const takeOut = entry?.isSelected === true && mayPick;
  const removable = entry?.isSelected === false && !past && !cancelled;

  // Zurück dorthin, woher man kam — der Termin, an dem das Lied nicht mehr
  // steht. Ohne Vorgeschichte (ein geteilter Link) ersetzt der Termin die Seite.
  const backToMeeting = () => {
    if (window.history.length > 1) router.back();
    else router.replace(`/termin?id=${meetingId}`);
  };

  const removeEntirely = () => {
    if (!entry) return;
    setChoosing(false);
    remove.mutate(entry.id, {
      onSuccess: () => {
        toast.success('Vom Termin entfernt.');
        backToMeeting();
      },
    });
  };

  const toSuggestions = () => {
    if (!entry) return;
    setChoosing(false);
    select.mutate(
      { meetingSongId: entry.id, isSelected: false },
      { onSuccess: () => toast.success('Wieder bei den Vorschlägen.') },
    );
  };

  const onRemove = async () => {
    if (takeOut) {
      setChoosing(true);
      return;
    }
    const ok = await confirm({
      title: 'Vom Termin entfernen?',
      body: 'Der Vorschlag verschwindet von diesem Abend, samt Stimmen. In der Liederliste bleibt das Lied.',
      confirmLabel: 'Entfernen',
      tone: 'danger',
    });
    if (ok) removeEntirely();
  };

  return (
    <>
      <EditBar
        editing={editing}
        onToggle={onToggle}
        aside={
          (takeOut || removable) && (
            <Button
              variant="secondary"
              className="flex-1"
              loading={select.isPending || remove.isPending}
              onClick={() => void onRemove()}
            >
              <Minus size={15} /> Entfernen
            </Button>
          )
        }
      />

      <Sheet
        open={choosing}
        onClose={() => setChoosing(false)}
        title="Aus der Setlist nehmen?"
        subtitle={entry?.song.title}
        footer={
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setChoosing(false)}
          >
            Abbrechen
          </Button>
        }
      >
        <div className="space-y-2">
          <RemovalChoice
            icon={<Undo2 size={16} />}
            title="Zurück zu den Vorschlägen"
            hint="Es bleibt am Abend, die Stimmen auch."
            onSelect={toSuggestions}
          />
          <RemovalChoice
            icon={<Trash2 size={16} />}
            title="Ganz vom Termin entfernen"
            hint="Es verschwindet von diesem Abend. In der Liederliste bleibt es."
            danger
            onSelect={removeEntirely}
          />
        </div>
      </Sheet>
    </>
  );
}

function RemovalChoice({
  icon,
  title,
  hint,
  danger = false,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors',
        danger
          ? 'border-alert-line hover:border-alert'
          : 'border-line hover:border-terracotta-300',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          danger
            ? 'bg-alert-bg text-alert'
            : 'bg-terracotta-50 text-terracotta-600',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-sm font-bold',
            danger ? 'text-alert' : 'text-stone-900',
          )}
        >
          {title}
        </span>
        <span className="block text-xs text-stone-500">{hint}</span>
      </span>
    </button>
  );
}

/**
 * „Tonart G" — auf dem Telefon als Note und Name, ab `sm` mit dem Wort.
 *
 * Neben dem Umschalter und dem Vollbild-Knopf stand oben an der Karte sonst
 * eine Zeile aus Wörtern, die auf dem Telefon umbrach. Die Note sagt dasselbe,
 * und für Screenreader bleibt das Wort stehen.
 */
function KeyBadge({
  tonart,
  original,
}: {
  tonart: string;
  /** Die Tonart der Quelle, wenn transponiert ist. */
  original: string | null;
}) {
  return (
    <Badge variant="terracotta">
      <Music2 size={12} aria-hidden className="sm:hidden" />
      <span className="sr-only sm:not-sr-only">Tonart</span>
      {tonart}
      {original && ` · Original ${original}`}
    </Badge>
  );
}

/** „Text | Akkorde" — klein, oben an der Karte; auf dem Telefon als Symbole. */
function ModeSwitch({
  value,
  onChange,
}: {
  value: SheetMode;
  onChange: (mode: SheetMode) => void;
}) {
  return (
    <Segmented
      size="sm"
      label="Ansicht"
      value={value}
      onChange={onChange}
      options={[
        {
          value: 'text',
          label: 'Text',
          icon: <AlignLeft size={14} aria-hidden />,
        },
        {
          value: 'chords',
          label: 'Akkorde',
          icon: <Guitar size={14} aria-hidden />,
        },
      ]}
    />
  );
}

/**
 * Löschen — nur für Admins, und nur, was an keinem Abend steht.
 *
 * Der Server verweigert es sonst (`SongService.remove`): Das Lied verschwände
 * aus Abenden, an denen es stand, und das Archiv hätte Lücken. Statt eines
 * Knopfs, der verlässlich eine Fehlermeldung erzeugt, steht dann da, warum
 * nicht — und was meistens gemeint ist.
 */
function DeleteSong({ song, own }: { song: Song; own: OwnSong | null }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const me = useMe();
  const remove = useDeleteSong();
  const removeOwn = useRemoveOwnSong();

  if (!me.isAdmin) return null;

  if (song.meetingCount > 0) {
    return (
      <p className="px-1 text-xs leading-relaxed text-stone-400">
        Steht noch an {song.meetingCount}{' '}
        {song.meetingCount === 1 ? 'Abend' : 'Abenden'} — löschen geht erst,
        wenn es dort nicht mehr steht. Meistens ist Umbenennen gemeint.
      </p>
    );
  }

  const deleteSong = async () => {
    const ok = await confirm({
      title: `„${song.title}" löschen?`,
      body: 'Es steht an keinem Abend — aus der Liederliste verschwindet es für alle.',
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;

    remove.mutate(song.id, {
      onSuccess: () => {
        if (own) removeOwn.mutate(song.id);
        toast.success(`„${song.title}" ist weg.`);
        router.replace('/archiv?register=lieder');
      },
    });
  };

  return (
    <Button
      variant="danger"
      className="w-full"
      loading={remove.isPending}
      onClick={() => void deleteSong()}
    >
      <Trash2 size={14} />
      Lied löschen
    </Button>
  );
}

// ------------------------------------------------------------- Verwaist

/** Das Lied ist aus der Liederliste verschwunden, die eigene Version nicht. */
function Orphaned({ own }: { own: OwnSong }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const remove = useRemoveOwnSong();
  const sheet = useMemo(
    () => parseSheet(own.text, { format: 'chordpro' }),
    [own.text],
  );
  const shift = useMemo(
    () => transposer(sheet, own.transpose),
    [sheet, own.transpose],
  );
  const [mode, setMode] = useState<SheetMode>('text');

  const removeVersion = async () => {
    const ok = await confirm({
      title: 'Deine Version entfernen?',
      body: 'Text und Akkorde sind dann von diesem Gerät weg.',
      confirmLabel: 'Entfernen',
      tone: 'danger',
    });
    if (!ok) return;
    remove.mutate(own.songId, {
      onSuccess: () => {
        toast.success('Deine Version ist entfernt.');
        router.replace('/archiv?register=lieder&lieder=meine');
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <div className="space-y-6 px-5 pt-safe-4 pb-10">
      <BackButton fallback="/archiv?register=lieder&lieder=meine" />
      <header>
        <h1 className="font-serif text-3xl leading-tight font-bold text-stone-900">
          {own.title}
        </h1>
        {own.artist && (
          <p className="mt-1 text-sm text-stone-400">{own.artist}</p>
        )}
      </header>
      <Card className="flex items-start gap-3 p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-stone-400" />
        <p className="text-xs leading-relaxed text-stone-500">
          Dieses Lied steht nicht mehr in eurer Liederliste. Deine Version liegt
          noch auf diesem Gerät.
        </p>
      </Card>
      <Card className="p-4">
        {hasChords(sheet) && (
          <div className="mb-4">
            <ModeSwitch value={mode} onChange={setMode} />
          </div>
        )}
        <ChordSheetView sheet={sheet} chord={shift.chord} mode={mode} />
      </Card>
      <Button
        variant="danger"
        className="w-full"
        loading={remove.isPending}
        onClick={() => void removeVersion()}
      >
        <Trash2 size={14} />
        Version entfernen
      </Button>
    </div>
  );
}
