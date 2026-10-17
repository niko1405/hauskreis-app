'use client';

/**
 * Eine eigene Version anlegen oder ändern — Text und Akkorde, nur für dich.
 *
 * Zwei Schritte und eine Vorschau: den Liedtext öffnen und alles kopieren, hier
 * einfügen, und darunter steht sofort, was die App daraus gelesen hat — mit
 * Tonart und der Auskunft, ob Akkorde dabei waren. Die App füllt nichts vor und
 * holt nichts selbst: Was hier steht, hat jemand mit eigener Hand von einer
 * Seite kopiert, für sich (CLAUDE.md §6.7). Deshalb gibt es den Editor auch
 * erst, wenn das Lied einen Link hat — von dort kommt der Text.
 *
 * **Eine Quelle der Wahrheit: der Text.** Die Vorschau ist `parseSheet` dessen,
 * was im Feld steht. Wer in der Vorschau etwas ändert, ändert das Blatt und
 * schreibt es als ChordPro zurück (`toChordPro`) — ab der ersten Änderung steht
 * im Feld also genau das, was gespeichert wird. Das „Rückgängig" ist ein Stapel
 * alter Stände.
 *
 * **Das Format ist ein Zustand und keine Vermutung.** Was aus der Vorschau
 * kommt, ist ChordPro und wird als solches gelesen; nur Eingefügtes wird
 * erkannt. Vorher wurde jedes Mal geraten, und ein Blatt ganz ohne Akkorde las
 * sich nach der ersten Änderung als „Akkorde über Text" — eine Textzeile wie
 * „A E" wäre dabei zu Akkorden geworden.
 *
 * **Unten steht dauerhaft eine Leiste**, sobald Text da ist, und sie hängt an
 * der Ansicht: unter „Akkorde" die Akkorde des Lieds zum Setzen, Suchen und
 * Ändern, unter „Text" die Zeilen — ändern, löschen, eine Leerzeile oder eine
 * neue Zeile darunter. Gespeichert wird deshalb oben rechts. **Am Rechner ist
 * sie eine Seitenleiste** (ab `lg`): Unten wäre sie dort weit weg von der
 * Maus und nähme dem Blatt die Höhe, während daneben Platz übrig ist.
 *
 * **Eine Ebene im Baum, kein Portal.** `ConfirmProvider` rendert seine
 * Rückfrage hinter allen Kindern; ein Portal ans Ende von `body` läge über ihr,
 * und „Verwerfen?" wäre unsichtbar. Dieselbe `z-50` wie ein Sheet, und weil
 * die Ebene später im Dokument steht als die Seite, liegt sie darüber.
 */
import {
  ArrowLeft,
  ChevronDown,
  ClipboardPaste,
  Code2,
  ExternalLink,
  Lock,
  Plus,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton, PRESSABLE } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { TextArea } from '@/components/ui/field';
import { lockOverlay } from '@/components/ui/overlay-lock';
import { Segmented } from '@/components/ui/segmented';
import { useUnsavedGuard } from '@/components/ui/unsaved';
import { isHttpUrl } from '@/components/domain/lyrics-link';
import {
  ChordLabel,
  ChordLyricLine,
  SectionLabel,
  useChordSpacing,
  type SheetMode,
} from '@/components/domain/chord-sheet-view';
import {
  detectKey,
  findChord,
  hasChords,
  insertChord,
  insertLine,
  moveChord,
  nudgeChord,
  parseSheet,
  removeChord,
  removeLine,
  renameChord,
  setLineText,
  setSectionLabel,
  toChordPro,
  type ChordRef,
  type Sheet,
  type SheetFormat,
} from '@/lib/chords';
import { cn } from '@/lib/cn';
import { ChordToolbar, LineToolbar } from './editor-toolbars';

export interface OwnVersionResult {
  text: string;
  key: string | null;
  capo: number | null;
}

/** Ein Stand des Texts — samt der Auskunft, wie er zu lesen ist. */
interface Draft {
  text: string;
  format: SheetFormat;
}

export function OwnVersionEditor({
  song,
  initialText = '',
  saving = false,
  onSave,
  onClose,
}: {
  song: { title: string; artist: string | null; lyricsUrl: string | null };
  /** Die gespeicherte Fassung, wenn eine geändert wird. */
  initialText?: string;
  saving?: boolean;
  onSave: (result: OwnVersionResult) => void;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  // Was die App selbst gespeichert hat, liest sie ohne Raten.
  const [draft, setDraft] = useState<Draft>({
    text: initialText,
    format: initialText ? 'chordpro' : 'auto',
  });
  const [history, setHistory] = useState<Draft[]>([]);
  const [mode, setMode] = useState<SheetMode>('chords');
  /** Unter „Akkorde": der angetippte Akkord im Text. */
  const [selected, setSelected] = useState<ChordRef | null>(null);
  /** Unter „Akkorde": der Akkord, der beim nächsten Tipp auf den Text entsteht. */
  const [armed, setArmed] = useState<string | null>(null);
  /** Unter „Text": die angetippte Zeile. */
  const [line, setLine] = useState<number | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const asking = useRef(false);

  const { text, format } = draft;
  const sheet = useMemo(() => parseSheet(text, { format }), [text, format]);
  const key = detectKey(sheet);
  const filled = text.trim() !== '';
  const dirty = text !== initialText;

  useUnsavedGuard(dirty);

  const requestClose = async () => {
    if (asking.current) return;
    if (dirty) {
      asking.current = true;
      const ok = await confirm({
        title: 'Änderungen verwerfen?',
        body: 'Was du hier eingefügt oder geändert hast, ist dann weg.',
        confirmLabel: 'Verwerfen',
        cancelLabel: 'Weiter bearbeiten',
        tone: 'danger',
      });
      asking.current = false;
      if (!ok) return;
    }
    onClose();
  };

  const clearSelection = () => {
    setSelected(null);
    setArmed(null);
    setLine(null);
  };

  // Escape nimmt zuerst zurück, was gerade gewählt ist, dann schließt es die
  // Ebene. Über eine Ref, damit der Effekt nicht bei jedem Buchstaben neu
  // angemeldet wird — dieselbe Überlegung wie in `sheet.tsx`.
  const onEscape = useRef(() => {});
  useEffect(() => {
    onEscape.current = () => {
      if (selected || armed || line !== null) clearSelection();
      else void requestClose();
    };
  });

  useEffect(() => {
    const release = lockOverlay();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !asking.current) onEscape.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      release();
    };
  }, []);

  /** Ein neuer Stand aus der Vorschau: ins Feld, und der alte auf den Stapel. */
  const apply = (next: Sheet) => {
    setHistory((stack) => [...stack, draft]);
    setDraft({ text: toChordPro(next), format: 'chordpro' });
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((stack) => stack.slice(0, -1));
    setDraft(previous);
    setSelected(null);
    setLine(null);
  };

  /** Was von außen kommt, wird erkannt — es kann alles Mögliche sein. */
  const replace = (pasted: string) => {
    setHistory((stack) => [...stack, draft]);
    setDraft({ text: pasted, format: 'auto' });
    clearSelection();
    setSourceOpen(false);
  };

  const canPaste =
    typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);

  const paste = async () => {
    try {
      const pasted = await navigator.clipboard.readText();
      if (pasted.trim() !== '') replace(pasted);
    } catch {
      // Abgelehnt oder leer — dann eben über das Feld, das geht immer.
    }
  };

  const switchMode = (next: SheetMode) => {
    clearSelection();
    setMode(next);
  };

  const save = () => onSave({ text: toChordPro(sheet), key, capo: sheet.capo });

  const selectedChord = selected ? chordAt(sheet, selected) : null;
  const textLines = sheet.lines.filter(
    (entry) => entry.kind === 'lyric' && entry.text.trim() !== '',
  ).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Eigene Version von ${song.title}`}
      className="fixed inset-0 z-50 flex flex-col bg-canvas lg:flex-row"
    >
      <div
        ref={scroller}
        className="min-w-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto w-full max-w-xl space-y-4 px-5 pt-safe-4 pb-6">
          <div className="flex items-center justify-between">
            <IconButton
              label="Zurück"
              onClick={() => void requestClose()}
              className="border border-line bg-card"
            >
              <ArrowLeft size={18} />
            </IconButton>
            <Button loading={saving} disabled={!filled} onClick={save}>
              <Lock size={14} />
              Speichern
            </Button>
          </div>

          <header>
            <p className="text-[11px] font-bold tracking-widest text-terracotta-600 uppercase">
              Eigene Version
            </p>
            <h1 className="mt-1 font-serif text-3xl leading-tight font-bold text-stone-900">
              {song.title}
            </h1>
            <p className="mt-1 text-sm text-stone-400">
              {[song.artist, key && `Tonart ${key}`]
                .filter(Boolean)
                .join(' · ') || 'Interpret unbekannt'}
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-terracotta-600">
              <Lock size={11} />
              Nur für dich · liegt nur auf diesem Gerät
            </p>
          </header>

          {isHttpUrl(song.lyricsUrl) && <SourceStep url={song.lyricsUrl} />}

          <section className="rounded-card border border-line bg-card p-4">
            <StepHead
              number={2}
              title="Hier einfügen"
              hint={
                filled
                  ? `Eingefügt · ${textLines} ${textLines === 1 ? 'Zeile' : 'Zeilen'}`
                  : undefined
              }
            />
            {(!filled || sourceOpen) && (
              <TextArea
                value={text}
                onChange={(event) => {
                  const next = event.target.value;
                  // Wer ins leere Feld schreibt, fügt ein; wer im Quelltext
                  // tippt, ändert ChordPro und bleibt dabei.
                  setDraft((current) => ({
                    text: next,
                    format:
                      current.text.trim() === '' ? 'auto' : current.format,
                  }));
                  clearSelection();
                }}
                onPaste={() =>
                  setDraft((current) => ({ ...current, format: 'auto' }))
                }
                rows={filled ? 10 : 4}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="Akkorde über dem Text oder ChordPro, beides wird erkannt."
                aria-label="Text und Akkorde"
                className="mt-3 font-mono text-[13px] leading-relaxed"
              />
            )}
            {filled ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {canPaste && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void paste()}
                  >
                    <ClipboardPaste size={13} />
                    Ersetzen
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={sourceOpen}
                  onClick={() => setSourceOpen((open) => !open)}
                >
                  <Code2 size={13} />
                  Quelltext
                  <ChevronDown
                    size={13}
                    className={cn(
                      'transition-transform',
                      sourceOpen && 'rotate-180',
                    )}
                  />
                </Button>
              </div>
            ) : (
              canPaste && (
                <button
                  type="button"
                  onClick={() => void paste()}
                  className={cn(
                    'mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-3 text-sm font-semibold text-terracotta-600 transition-colors hover:border-terracotta-400',
                    PRESSABLE,
                  )}
                >
                  <ClipboardPaste size={15} />
                  Aus Zwischenablage einfügen
                </button>
              )
            )}
          </section>

          {filled && (
            <section
              className={cn(
                'rounded-card border bg-card p-4 transition-shadow',
                armed
                  ? 'border-terracotta-500 ring-2 ring-terracotta-500/30'
                  : 'border-line',
              )}
            >
              <div className="flex items-center gap-2">
                <p className="mr-auto text-[11px] font-bold tracking-widest text-stone-400 uppercase">
                  Vorschau
                </p>
                {history.length > 0 && (
                  <IconButton label="Rückgängig" onClick={undo}>
                    <Undo2 size={16} />
                  </IconButton>
                )}
                <Segmented
                  size="sm"
                  label="Ansicht"
                  value={mode}
                  onChange={switchMode}
                  options={[
                    { value: 'chords', label: 'Akkorde' },
                    { value: 'text', label: 'Text' },
                  ]}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {hasChords(sheet) ? (
                  <Badge variant="success">Akkorde erkannt</Badge>
                ) : (
                  <Badge>Nur Text</Badge>
                )}
                {key && <Badge variant="terracotta">Tonart {key}</Badge>}
                {sheet.capo && <Badge>Kapo {sheet.capo}</Badge>}
              </div>

              {mode === 'chords' ? (
                <EditablePreview
                  sheet={sheet}
                  selected={selected}
                  armed={armed}
                  scroller={scroller}
                  onSelect={(ref) => {
                    setSelected(ref);
                    if (ref) setArmed(null);
                  }}
                  // Nach dem Ziehen ist nichts ausgewählt: Wer zieht, ist fertig.
                  onMove={(from, to) => {
                    if (!samePlace(sheet, from, to)) {
                      apply(moveChord(sheet, from, to));
                    }
                    setSelected(null);
                  }}
                  // Gesetzt wird, was unten gewählt ist — und es bleibt gewählt,
                  // denn ein Akkord kommt in einem Lied selten nur einmal vor.
                  onPlace={(lineIndex, at) => {
                    if (armed) apply(insertChord(sheet, lineIndex, at, armed));
                  }}
                />
              ) : (
                <LinePreview sheet={sheet} selected={line} onSelect={setLine} />
              )}
            </section>
          )}
        </div>
      </div>

      {filled && (
        <footer className="pb-safe shrink-0 border-t border-line bg-canvas/95 backdrop-blur lg:w-80 lg:overflow-y-auto lg:border-t-0 lg:border-l lg:bg-card xl:w-96">
          <div className="mx-auto w-full max-w-xl px-5 pt-3 pb-3 lg:max-w-none lg:pt-5">
            <p className="mb-4 hidden text-[11px] font-bold tracking-widest text-stone-400 uppercase lg:block">
              {mode === 'chords' ? 'Akkorde' : 'Zeilen'}
            </p>
            {mode === 'chords' ? (
              <ChordToolbar
                // Neu, sobald ein anderer Akkord gewählt ist: Die Suche von
                // eben gehört zu ihm.
                key={selected ? `${selected.line}:${selected.index}` : 'neu'}
                sheet={sheet}
                songKey={key}
                selected={selectedChord}
                armed={armed}
                onArm={setArmed}
                onRename={(name) => {
                  if (selected) apply(renameChord(sheet, selected, name));
                }}
                onNudge={(delta) => {
                  if (!selected) return;
                  const next = nudgeChord(sheet, selected, delta);
                  apply(next);
                  setSelected(nudged(sheet, next, selected, delta));
                }}
                onRemove={() => {
                  if (selected) apply(removeChord(sheet, selected));
                  setSelected(null);
                }}
                onDone={() => setSelected(null)}
              />
            ) : (
              <LineToolbar
                key={line ?? 'keine'}
                line={line === null ? null : (sheet.lines[line] ?? null)}
                onText={(value) => {
                  if (line !== null) apply(setLineText(sheet, line, value));
                }}
                onLabel={(value) => {
                  if (line !== null) apply(setSectionLabel(sheet, line, value));
                }}
                onInsertText={(value) => {
                  if (line === null) return;
                  apply(
                    insertLine(sheet, line, {
                      kind: 'lyric',
                      text: value.trimEnd(),
                      chords: [],
                    }),
                  );
                  setLine(line + 1);
                }}
                onInsertBlank={() => {
                  if (line !== null) {
                    apply(insertLine(sheet, line, { kind: 'blank' }));
                  }
                }}
                onRemove={() => {
                  if (line !== null) apply(removeLine(sheet, line));
                  setLine(null);
                }}
                onDone={() => setLine(null)}
              />
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

function StepHead({
  number,
  title,
  hint,
}: {
  number: number;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-terracotta-500/85 font-serif text-lg text-white">
        {number}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-stone-800">{title}</span>
        {hint && (
          <span className="block text-[11px] text-stone-400">{hint}</span>
        )}
      </span>
    </div>
  );
}

/**
 * Schritt 1: dorthin, wo der Liedtext steht.
 *
 * Ohne Link gibt es den Editor gar nicht erst — außer für eine Version, deren
 * Lied seinen Link später verloren hat. Dann fehlt dieser Schritt einfach.
 */
function SourceStep({ url }: { url: string }) {
  return (
    <section className="flex items-center gap-3 rounded-card border border-line bg-card p-4">
      <div className="min-w-0 flex-1">
        <StepHead
          number={1}
          title="Sheet holen"
          hint="Liedtext öffnen, alles kopieren"
        />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-terracotta-600 transition-colors hover:border-terracotta-400',
          PRESSABLE,
        )}
      >
        Öffnen
        <ExternalLink size={14} />
      </a>
    </section>
  );
}

// ------------------------------------------------------------- Vorschau

function chordAt(sheet: Sheet, ref: ChordRef): string | null {
  const line = sheet.lines[ref.line];
  if (!line || line.kind !== 'lyric') return null;
  return line.chords[ref.index]?.chord ?? null;
}

/**
 * Ob ein gezogener Akkord dort losgelassen wurde, wo er stand — dann ist
 * nichts passiert, und es soll auch nichts auf dem Stapel landen.
 */
function samePlace(
  sheet: Sheet,
  from: ChordRef,
  to: { line: number; at: number },
): boolean {
  if (from.line !== to.line) return false;
  const line = sheet.lines[from.line];
  if (line?.kind !== 'lyric') return false;
  return line.text === ''
    ? to.at === from.index || to.at === from.index + 1
    : line.chords[from.index]?.at === Math.min(to.at, line.text.length);
}

/** Wo ein geschobener Akkord danach steht. */
function nudged(
  before: Sheet,
  after: Sheet,
  ref: ChordRef,
  delta: -1 | 1,
): ChordRef | null {
  const line = before.lines[ref.line];
  if (!line || line.kind !== 'lyric') return null;
  const entry = line.chords[ref.index];
  if (!entry) return null;

  if (line.text === '') {
    const index = ref.index + delta;
    return index >= 0 && index < line.chords.length
      ? { line: ref.line, index }
      : ref;
  }

  const at = Math.max(0, Math.min(entry.at + delta, line.text.length));
  return findChord(after, ref.line, at, entry.chord) ?? ref;
}

/** Wohin ein gezogener Akkord fiele — und wo der Strich dafür steht. */
interface DropTarget {
  line: number;
  at: number;
  mark: { x: number; top: number; height: number };
}

interface Drag {
  ref: ChordRef;
  chord: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** Wo im Chip angefasst wurde — der Chip bleibt unter dem Finger. */
  grabX: number;
  grabY: number;
  height: number;
  /** Ein Finger verdeckt, was er hält: Der Chip schwebt etwas darüber. */
  lift: number;
  moving: boolean;
}

/** Die Textstelle unter einem Punkt, über die Schnittstelle des Browsers. */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y);
    return position
      ? { node: position.offsetNode, offset: position.offset }
      : null;
  }
  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    return range
      ? { node: range.startContainer, offset: range.startOffset }
      : null;
  }
  return null;
}

/**
 * Zeile und Stelle im Text unter einem Punkt — samt Ort für den Strich.
 *
 * Ein leeres Textstück trägt ein Zeichen ohne Breite (`chord-sheet-view.tsx`);
 * die Stelle dahinter gibt es im Text nicht, und das Bearbeiten begrenzt sie
 * ohnehin auf das Zeilenende.
 */
function textTarget(x: number, y: number): DropTarget | null {
  const caret = caretAt(x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return null;

  const span = caret.node.parentElement?.closest<HTMLElement>('[data-start]');
  const line = span?.closest<HTMLElement>('[data-line]');
  if (!span || !line) return null;

  const range = document.createRange();
  range.setStart(caret.node, caret.offset);
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  const lineRect = span.parentElement?.getBoundingClientRect() ?? rect;

  return {
    line: Number(line.dataset.line),
    at: Number(span.dataset.start) + caret.offset,
    mark: { x: rect.left, top: lineRect.top, height: lineRect.height },
  };
}

/** Der Platz in einer reinen Akkordzeile — vor dem ersten Chip rechts vom Punkt. */
function chordRowTarget(
  x: number,
  y: number,
  dragged: ChordRef,
): DropTarget | null {
  const row = document
    .elementsFromPoint(x, y)
    .find(
      (element) =>
        element instanceof HTMLElement && element.dataset.chordsOnly === 'true',
    ) as HTMLElement | undefined;
  if (!row) return null;

  const line = Number(row.dataset.line);
  const chips = [...row.querySelectorAll<HTMLElement>('[data-chip]')];
  let slot = chips.length;
  for (const [index, chip] of chips.entries()) {
    const rect = chip.getBoundingClientRect();
    if (x < rect.left + rect.width / 2) {
      slot = index;
      break;
    }
  }

  const rowRect = row.getBoundingClientRect();
  const anchor = chips[slot]?.getBoundingClientRect();
  const lastChip = chips[chips.length - 1]?.getBoundingClientRect();
  const markX = anchor
    ? anchor.left - 4
    : lastChip
      ? lastChip.right + 4
      : rowRect.left;
  const mark = { x: markX, top: rowRect.top, height: rowRect.height };

  // Auf den eigenen Platz zurück ist keine Bewegung.
  if (
    line === dragged.line &&
    (slot === dragged.index || slot === dragged.index + 1)
  ) {
    return { line, at: dragged.index, mark };
  }

  return { line, at: slot, mark };
}

function EditablePreview({
  sheet,
  selected,
  armed,
  scroller,
  onSelect,
  onMove,
  onPlace,
}: {
  sheet: Sheet;
  selected: ChordRef | null;
  armed: string | null;
  scroller: React.RefObject<HTMLDivElement | null>;
  onSelect: (ref: ChordRef | null) => void;
  onMove: (from: ChordRef, to: { line: number; at: number }) => void;
  onPlace: (line: number, at: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<{
    chord: string;
    x: number;
    y: number;
  } | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [dragging, setDragging] = useState<ChordRef | null>(null);

  useChordSpacing(root);

  const findTarget = (state: Drag, x: number, y: number): DropTarget | null => {
    const left = x - state.grabX;
    const top = y - state.grabY - state.lift;
    // Der Chip steht über seinem Text: Gesucht wird die Stelle unter seiner
    // linken Kante, eine Zeile tiefer.
    return (
      chordRowTarget(left + 4, top + state.height / 2, state.ref) ??
      textTarget(left + 2, top + state.height * 1.9)
    );
  };

  const onPointerDown =
    (ref: ChordRef, chord: string) =>
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        ref,
        chord,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        grabX: event.clientX - rect.left,
        grabY: event.clientY - rect.top,
        height: rect.height,
        lift: event.pointerType === 'touch' ? 28 : 0,
        moving: false,
      };
    };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;

    if (!state.moving) {
      const distance = Math.hypot(
        event.clientX - state.startX,
        event.clientY - state.startY,
      );
      if (distance < 6) return;
      state.moving = true;
      setDragging(state.ref);
      onSelect(null);
    }

    setGhost({
      chord: state.chord,
      x: event.clientX - state.grabX,
      y: event.clientY - state.grabY - state.lift,
    });
    setTarget(findTarget(state, event.clientX, event.clientY));

    // Am Rand der Ebene rollt sie mit — unten über der Leiste, am Rechner
    // am unteren Bildrand.
    const container = scroller.current;
    if (container) {
      const { top, bottom } = container.getBoundingClientRect();
      if (event.clientY < top + 90) container.scrollBy(0, -12);
      else if (event.clientY > bottom - 60) container.scrollBy(0, 12);
    }
  };

  const finish = (
    event: React.PointerEvent<HTMLButtonElement>,
    cancelled: boolean,
  ) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;

    if (!state.moving) {
      if (!cancelled) onSelect(state.ref);
      return;
    }

    const drop = cancelled
      ? null
      : findTarget(state, event.clientX, event.clientY);
    setGhost(null);
    setTarget(null);
    setDragging(null);

    if (drop) onMove(state.ref, { line: drop.line, at: drop.at });
  };

  const chip = (ref: ChordRef, chord: string) => {
    const isSelected =
      selected?.line === ref.line && selected.index === ref.index;
    const isDragged =
      dragging?.line === ref.line && dragging.index === ref.index;

    return (
      <button
        key={ref.index}
        type="button"
        data-chip=""
        aria-label={`Akkord ${chord} bearbeiten`}
        aria-pressed={isSelected}
        onPointerDown={onPointerDown(ref, chord)}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finish(event, false)}
        onPointerCancel={(event) => finish(event, true)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(ref);
          }
        }}
        className={cn(
          '-mx-1 cursor-grab touch-none rounded-md px-1 select-none active:cursor-grabbing',
          isSelected
            ? 'bg-terracotta-500 text-white [&_span]:text-white'
            : 'hover:bg-terracotta-50',
          isDragged && 'opacity-30',
        )}
      >
        <ChordLabel>{chord}</ChordLabel>
      </button>
    );
  };

  // Ein Tipp auf den Text setzt den gewählten Akkord. Ohne gewählten nimmt er
  // nur die Auswahl zurück — ein Akkord entsteht nicht mehr aus Versehen.
  const onTextClick = (event: React.MouseEvent) => {
    if (!armed) {
      onSelect(null);
      return;
    }
    const hit = textTarget(event.clientX, event.clientY);
    if (hit) onPlace(hit.line, hit.at);
  };

  // Mit der Maus zeigt der Strich schon beim Überfahren, wo der Akkord landet.
  // Mit dem Finger gibt es kein Überfahren; dort zeigt es der Tipp selbst.
  const onHover = (event: React.PointerEvent) => {
    if (!armed || drag.current || event.pointerType !== 'mouse') return;
    setTarget(textTarget(event.clientX, event.clientY));
  };

  return (
    // Nur das Überfahren mit der Maus, keine Bedienung: Getippt wird auf die
    // Zeilen darin.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={root}
      onPointerMove={onHover}
      onPointerLeave={() => {
        if (!drag.current) setTarget(null);
      }}
      className="mt-4 text-[15px] leading-snug text-stone-800"
    >
      {/* Eine Zeile hat keine Identität außer ihrem Platz im Blatt: Eine
          Leerzeile ist wie die andere, und gleiche Textzeilen kommen in jedem
          Refrain vor. Der Platz ist deshalb der Schlüssel. */}
      {sheet.lines.map((line, index) => {
        if (line.kind === 'blank') {
          // eslint-disable-next-line react/no-array-index-key
          return <div key={index} className="h-[0.9em]" />;
        }
        if (line.kind === 'section') {
          // eslint-disable-next-line react/no-array-index-key
          return <SectionLabel key={index}>{line.label}</SectionLabel>;
        }
        if (line.text === '') {
          return (
            <ChordsOnlyLine
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              index={index}
              chords={line.chords.map((entry, chordIndex) =>
                chip({ line: index, index: chordIndex }, entry.chord),
              )}
              armed={armed}
              onAppend={() => onPlace(index, Number.MAX_SAFE_INTEGER)}
            />
          );
        }
        return (
          <ChordLyricLine
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            line={line}
            lineIndex={index}
            onClick={onTextClick}
            className={armed ? 'cursor-crosshair' : 'cursor-text'}
            renderChord={(entry) =>
              chip({ line: index, index: entry.index }, entry.chord)
            }
          />
        );
      })}

      {/* Der gehaltene Chip und der Strich, wo er landen würde. Fest am
          Bildschirm und ohne Zeiger: Die Suche nach dem Ziel fragt, was unter
          ihnen liegt. */}
      {ghost && (
        <span
          className="pointer-events-none fixed z-[60] rounded-md bg-terracotta-500 px-1.5 py-0.5 text-white shadow-lg [&_span]:text-white"
          style={{ left: ghost.x, top: ghost.y }}
        >
          <ChordLabel>{ghost.chord}</ChordLabel>
        </span>
      )}
      {target && (
        <span
          className="pointer-events-none fixed z-[60] w-0.5 rounded-full bg-terracotta-500"
          style={{
            left: target.mark.x - 1,
            top: target.mark.top,
            height: target.mark.height,
          }}
        />
      )}
    </div>
  );
}

/**
 * Ein Vorspiel, ein Zwischenspiel — Akkorde ohne Text. Dort zählt nur die
 * Reihenfolge; das „+" hängt den gewählten Akkord hinten an.
 */
function ChordsOnlyLine({
  index,
  chords,
  armed,
  onAppend,
}: {
  index: number;
  chords: React.ReactNode[];
  armed: string | null;
  onAppend: () => void;
}) {
  return (
    <div
      data-line={index}
      data-chords-only="true"
      className="flex min-h-[1.6em] flex-wrap items-center gap-x-[1.1em] py-0.5"
    >
      {chords}
      {armed && (
        <button
          type="button"
          aria-label={`${armed} anhängen`}
          onClick={onAppend}
          className="flex size-6 items-center justify-center rounded-md border border-dashed border-terracotta-400 text-terracotta-600 hover:bg-terracotta-50"
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * Die Vorschau unter „Text": jede Zeile zum Antippen, ohne Akkorde.
 *
 * Reine Akkordzeilen fehlen hier, wie im Text-Modus beim Lesen — wer den Text
 * bearbeitet, sucht ein Wort und kein Vorspiel. Gezählt wird trotzdem im
 * ganzen Blatt, damit die Leiste die richtige Zeile ändert.
 */
function LinePreview({
  sheet,
  selected,
  onSelect,
}: {
  sheet: Sheet;
  selected: number | null;
  onSelect: (line: number | null) => void;
}) {
  return (
    <div className="mt-4 text-[15px] leading-snug text-stone-800">
      {sheet.lines.map((line, index) => {
        if (line.kind === 'lyric' && line.text === '') return null;
        const active = selected === index;

        return (
          <button
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? null : index)}
            className={cn(
              '-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 text-left transition-colors',
              active
                ? 'bg-terracotta-500/10 ring-1 ring-terracotta-500/40'
                : 'hover:bg-shell',
            )}
          >
            {line.kind === 'blank' ? (
              <span className="block h-[1.1em] text-[11px] text-stone-400">
                {active && 'Leerzeile'}
              </span>
            ) : line.kind === 'section' ? (
              <span className="mt-[0.6em] mb-[0.25em] block text-[0.72em] font-bold tracking-widest text-terracotta-600 uppercase">
                {line.label}
              </span>
            ) : (
              <span className="block whitespace-pre-wrap">
                {line.text.trimEnd()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
