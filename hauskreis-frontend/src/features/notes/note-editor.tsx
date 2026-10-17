'use client';

import { Bold, Heading2, List, ListChecks } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { TextArea } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import {
  applyFormat,
  continueList,
  type Format,
  type TextEdit,
} from '@/lib/notes/markdown';

const TOOLS: { format: Format; label: string; icon: React.ReactNode }[] = [
  { format: 'heading', label: 'Überschrift', icon: <Heading2 size={16} /> },
  { format: 'list', label: 'Liste', icon: <List size={16} /> },
  { format: 'check', label: 'Checkliste', icon: <ListChecks size={16} /> },
  { format: 'bold', label: 'Fett', icon: <Bold size={16} /> },
];

/**
 * Das Textfeld einer Notiz — mit einer Zeile Knöpfe darüber.
 *
 * **Die Knöpfe setzen die Zeichen**, damit niemand die Schreibweise kennen
 * muss: „Checkliste" macht aus den markierten Zeilen Punkte zum Abhaken, ein
 * zweiter Druck nimmt es zurück. Und **Enter setzt eine Liste fort**, wie in
 * jeder Notiz-App; ein Enter auf einem leeren Punkt beendet sie.
 *
 * Die Knöpfe nehmen dem Feld den Fokus nicht (`preventDefault` beim
 * Herunterdrücken): Sonst ginge auf dem Telefon bei jedem Tipp die Tastatur zu
 * und die Auswahl verloren. Das Feld wächst mit dem Text, statt selbst zu
 * scrollen — eine Seite mit zwei Scrollbereichen ineinander verliert man.
 */
export function NoteEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  // Wohin die Auswahl nach dem nächsten Rendern soll — erst dann steht der
  // neue Text im Feld.
  const pending = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight + 2}px`;

    if (pending.current) {
      element.setSelectionRange(pending.current.start, pending.current.end);
      pending.current = null;
    }
  }, [value]);

  const commit = (edit: TextEdit) => {
    pending.current = { start: edit.selectionStart, end: edit.selectionEnd };
    onChange(edit.value);
  };

  const current = (): TextEdit => {
    const element = field.current;
    return {
      value,
      selectionStart: element?.selectionStart ?? value.length,
      selectionEnd: element?.selectionEnd ?? value.length,
    };
  };

  return (
    <div>
      <div
        role="toolbar"
        aria-label="Formatieren"
        className="sticky top-0 z-10 -mx-1 mb-2 flex gap-1 bg-canvas/95 px-1 py-1.5 backdrop-blur"
      >
        {TOOLS.map((tool) => (
          <button
            key={tool.format}
            type="button"
            aria-label={tool.label}
            title={tool.label}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              commit(applyFormat(current(), tool.format));
              field.current?.focus();
            }}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs font-semibold text-stone-600 transition-colors',
              'hover:border-terracotta-300 hover:text-terracotta-700 active:bg-terracotta-50',
            )}
          >
            {tool.icon}
            <span className="hidden sm:inline">{tool.label}</span>
          </button>
        ))}
      </div>

      <TextArea
        ref={field}
        aria-label="Text der Notiz"
        value={value}
        placeholder={
          'Schreib einfach los.\n\n- [ ] So wird ein Punkt zum Abhaken\n- eine Liste\n## eine Überschrift'
        }
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          if (event.nativeEvent.isComposing) return;
          const next = continueList(current());
          if (!next) return;
          event.preventDefault();
          commit(next);
        }}
        className="min-h-48 resize-none overflow-hidden text-[15px] leading-relaxed"
      />
    </div>
  );
}
