'use client';

/**
 * Die beiden Leisten unten im Editor — eine für die Akkorde, eine für den Text.
 *
 * Sie stehen dauerhaft da, sobald es etwas zu bearbeiten gibt, wo der Daumen
 * ist, wie eine Leiste über der Tastatur. Am Rechner stehen sie als
 * Seitenleiste rechts (`lg:`): Die Akkorde brechen dort um, statt seitwärts zu
 * scrollen, und Suche und Knöpfe stehen oben, wo man zuerst hinschaut. Welche es ist, entscheidet die
 * Ansicht der Vorschau: Unter „Akkorde" geht es um Akkorde, unter „Text" um
 * Zeilen, und eine Leiste für beides wäre zwei Werkzeugkästen übereinander.
 *
 * **Akkorde werden gewählt, dann gesetzt.** Ein Tipp auf einen Akkord unten
 * schaltet den Setzen-Modus ein — der Chip ist gefüllt, die Vorschau trägt
 * einen Rahmen, und darüber steht, was passiert. Jeder Tipp auf den Text setzt
 * ihn dann, bis man den Modus beendet. Vorher entstand bei jedem Tipp auf den
 * Text ein Akkord, geraten aus dem davor, und wer nur scrollen wollte, hatte
 * danach einen mehr.
 */
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pilcrow,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, PRESSABLE } from '@/components/ui/button';
import {
  chordsOf,
  diatonicChords,
  searchChords,
  type Sheet,
  type SheetLine,
} from '@/lib/chords';
import { cn } from '@/lib/cn';

/** Die Akkorde des Lieds nach Häufigkeit, dann die Stufen der Tonart. */
function suggestionsFor(sheet: Sheet, key: string | null): string[] {
  const counts = new Map<string, number>();
  for (const chord of chordsOf(sheet)) {
    counts.set(chord, (counts.get(chord) ?? 0) + 1);
  }
  const used = [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .map(([chord]) => chord);
  const scale = key ? diatonicChords(key, sheet.notation) : [];

  return [...new Set([...used, ...scale])];
}

function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label
      className={cn('relative flex min-w-0 flex-1 items-center', className)}
    >
      <Search
        size={14}
        className="pointer-events-none absolute left-3 text-stone-400"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit();
          }
        }}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        placeholder={placeholder}
        aria-label="Akkord suchen"
        className="h-9 w-full min-w-0 rounded-full border border-line bg-card pr-8 pl-8 text-sm font-semibold text-stone-800 outline-none placeholder:font-normal placeholder:text-stone-400 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 [&::-webkit-search-cancel-button]:hidden"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Suche leeren"
          onClick={() => onChange('')}
          className="absolute right-2 flex size-6 items-center justify-center rounded-full text-stone-400 hover:text-stone-600"
        >
          <X size={13} />
        </button>
      )}
    </label>
  );
}

// ---------------------------------------------------------- Akkord-Leiste

export function ChordToolbar({
  sheet,
  songKey,
  selected,
  armed,
  onArm,
  onRename,
  onNudge,
  onRemove,
  onDone,
}: {
  sheet: Sheet;
  songKey: string | null;
  /** Der angetippte Akkord im Text — dann benennt ein Chip ihn um. */
  selected: string | null;
  /** Der Akkord, der beim nächsten Tipp auf den Text entsteht. */
  armed: string | null;
  onArm: (chord: string | null) => void;
  onRename: (chord: string) => void;
  onNudge: (delta: -1 | 1) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState('');
  const preferred = suggestionsFor(sheet, songKey);
  const chips =
    query.trim() === ''
      ? preferred
      : searchChords(query, { notation: sheet.notation, preferred });

  const pick = (chord: string) => {
    if (selected) onRename(chord);
    else onArm(chord === armed ? null : chord);
  };

  const first = chips[0];
  const submit = () => {
    if (first) pick(first);
  };

  // Auf dem Telefon die Akkorde oben und seitwärts scrollbar; in der
  // Seitenleiste unter Suche und Knöpfen, umbrochen.
  return (
    <div className="flex flex-col gap-3">
      <div className="no-scrollbar order-1 -mx-5 flex min-h-9 gap-2 overflow-x-auto px-5 lg:order-2 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {chips.length === 0 ? (
          <p className="self-center text-xs text-stone-400">
            {query.trim() === ''
              ? 'Noch keine Akkorde im Lied — such dir einen.'
              : `„${query.trim()}" kennt die App nicht als Akkord.`}
          </p>
        ) : (
          chips.map((name) => {
            const active = name === (selected ?? armed);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => pick(name)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-sm font-bold transition-colors',
                  PRESSABLE,
                  active
                    ? 'border-terracotta-500 bg-terracotta-500 text-white'
                    : 'border-line bg-card text-terracotta-600 hover:border-terracotta-400',
                )}
              >
                {name}
              </button>
            );
          })
        )}
      </div>

      {selected ? (
        <div className="order-2 flex flex-wrap items-center gap-2 lg:order-1">
          <IconButton
            label="Ein Zeichen nach links"
            onClick={() => onNudge(-1)}
            className="border border-line"
          >
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton
            label="Ein Zeichen nach rechts"
            onClick={() => onNudge(1)}
            className="border border-line"
          >
            <ChevronRight size={18} />
          </IconButton>
          <SearchField
            value={query}
            onChange={setQuery}
            onSubmit={submit}
            placeholder={`${selected} ändern …`}
            className="lg:order-first lg:basis-full"
          />
          <IconButton
            label="Akkord entfernen"
            onClick={onRemove}
            className="border border-line text-alert hover:text-alert"
          >
            <Trash2 size={16} />
          </IconButton>
          <IconButton
            label="Fertig"
            onClick={onDone}
            className="bg-terracotta-500 text-white hover:bg-terracotta-700 hover:text-white"
          >
            <Check size={18} />
          </IconButton>
        </div>
      ) : (
        <div className="order-2 space-y-3 lg:order-1">
          <SearchField
            value={query}
            onChange={setQuery}
            onSubmit={submit}
            placeholder="Akkord suchen, z. B. F#m7"
          />
          {armed ? (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-terracotta-500/40 bg-terracotta-500/10 py-1.5 pr-1.5 pl-3"
            >
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-terracotta-500" />
              <span className="min-w-0 flex-1 text-xs text-stone-700">
                <b className="text-terracotta-600">{armed}</b> setzen — tipp auf
                die Stelle im Text
              </span>
              <IconButton
                label="Setzen beenden"
                onClick={() => onArm(null)}
                className="shrink-0"
              >
                <X size={16} />
              </IconButton>
            </div>
          ) : (
            <p className="text-center text-[11px] leading-relaxed text-stone-400 lg:text-left">
              Akkord wählen, dann auf die Stelle im Text tippen. Einen Akkord im
              Text ziehen oder antippen, um ihn zu ändern.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Text-Leiste

function textOf(line: SheetLine): string {
  if (line.kind === 'section') return line.label;
  if (line.kind === 'lyric') return line.text.trimEnd();
  return '';
}

export function LineToolbar({
  line,
  onText,
  onLabel,
  onInsertText,
  onInsertBlank,
  onRemove,
  onDone,
}: {
  line: SheetLine | null;
  onText: (text: string) => void;
  onLabel: (label: string) => void;
  onInsertText: (text: string) => void;
  onInsertBlank: () => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const original = line ? textOf(line) : '';
  const [draft, setDraft] = useState(original);
  /** „+ Zeile": Das Feld nimmt eine neue Zeile auf statt die gewählte. */
  const [adding, setAdding] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) input.current?.focus();
  }, [adding]);

  if (!line) {
    return (
      <p className="py-2 text-center text-[11px] leading-relaxed text-stone-400 lg:text-left">
        Tipp auf eine Zeile, um sie zu ändern, zu löschen oder darunter etwas
        einzufügen.
      </p>
    );
  }

  const commit = () => {
    if (adding) {
      setAdding(false);
      if (draft.trim() !== '') onInsertText(draft);
      else setDraft(original);
      return;
    }
    if (draft === original) return;
    if (line.kind === 'section') {
      if (draft.trim() === '') setDraft(original);
      else onLabel(draft);
    } else {
      onText(draft);
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={input}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Escape' && adding) {
            event.stopPropagation();
            setAdding(false);
            setDraft(original);
          }
        }}
        enterKeyHint="done"
        placeholder={
          adding
            ? 'Neue Zeile darunter'
            : line.kind === 'section'
              ? 'Name des Abschnitts'
              : line.kind === 'blank'
                ? 'Text eintippen, um daraus eine Zeile zu machen'
                : 'Text der Zeile'
        }
        aria-label={adding ? 'Neue Zeile' : 'Text der Zeile'}
        className={cn(
          'h-10 w-full min-w-0 rounded-md border bg-card px-3 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-terracotta-100',
          adding
            ? 'border-terracotta-400'
            : 'border-line focus:border-terracotta-400',
          line.kind === 'section' &&
            !adding &&
            'font-bold tracking-wide text-terracotta-600 uppercase',
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setAdding(true);
            setDraft('');
          }}
        >
          <Plus size={13} />
          Zeile
        </Button>
        <Button size="sm" variant="secondary" onClick={onInsertBlank}>
          <Pilcrow size={13} />
          Leerzeile
        </Button>
        <span className="flex-1" />
        <IconButton
          label="Zeile löschen"
          onClick={onRemove}
          className="border border-line text-alert hover:text-alert"
        >
          <Trash2 size={16} />
        </IconButton>
        <IconButton
          label="Fertig"
          onClick={onDone}
          className="bg-terracotta-500 text-white hover:bg-terracotta-700 hover:text-white"
        >
          <Check size={18} />
        </IconButton>
      </div>
    </div>
  );
}
