'use client';

/**
 * Formularbausteine und die Inline-Bearbeitung aus dem Entwurf: Text steht
 * da, ein Stift daneben, beim Antippen wird daraus ein Eingabefeld.
 */
import { Check, Pencil, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { IconButton, PRESSABLE } from './button';

const CONTROL =
  'w-full rounded-md border border-line bg-card px-4 py-2.5 text-sm text-stone-800 ' +
  'placeholder:text-stone-300 focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 focus:outline-none ' +
  'disabled:bg-stone-50 disabled:text-stone-400';

/**
 * Die Überschrift über einem Feld, das kein `Field` ist.
 *
 * `Field` bringt sein Label selbst mit — hier geht es um die Stellen, an denen
 * unter der Überschrift ein `InlineEdit` steht statt eines Eingabefelds. Stand
 * dreimal wortgleich in drei Dateien; beim vierten Aufrufer war es Zeit.
 */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-stone-500">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-alert">{error}</span>
      ) : (
        hint && (
          <span className="mt-1 block text-xs text-stone-400">{hint}</span>
        )
      )}
    </label>
  );
}

export function TextInput({
  className,
  ...props
}: React.ComponentPropsWithRef<'input'>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function TextArea({
  className,
  ...props
}: React.ComponentPropsWithRef<'textarea'>) {
  return (
    <textarea
      className={cn(CONTROL, 'min-h-24 resize-y', className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<'select'>) {
  return (
    <select className={cn(CONTROL, className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  description,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong text-terracotta-500 focus:ring-terracotta-500"
        {...props}
      />
      <span>
        <span className="block text-sm font-semibold text-stone-700">
          {label}
        </span>
        {description && (
          <span className="block text-xs text-stone-400">{description}</span>
        )}
      </span>
    </label>
  );
}

/**
 * Ein Feld, das erst beim Antippen zum Eingabefeld wird. `emptyLabel` ist
 * bewusst ein eigener Text: „Noch kein Titel" sagt etwas anderes als „—".
 *
 * `startOpen` und `onDiscard` gehören zusammen und sind für Felder da, die es
 * vorher **gar nicht gab**: In der Nachbereitung legt man Zusammenfassung und
 * Actionstep einzeln an, und ein gerade angelegtes Feld, das leer bleibt, soll
 * wieder verschwinden statt als leere Zeile stehenzubleiben.
 */
export function InlineEdit({
  value,
  onSave,
  label,
  emptyLabel = 'Noch nichts eingetragen',
  multiline = false,
  placeholder,
  saving = false,
  className,
  inputClassName,
  startOpen = false,
  onDiscard,
  editLabel,
}: {
  value: string | null;
  /**
   * Fehlt sie, ist das Feld nur Anzeige — kein Stift, kein Bearbeitungsmodus.
   * Gebraucht, seit manche Felder nur den Zuständigen gehören: den anderen den
   * Stift zu zeigen und dann mit 403 zu antworten wäre eine Einladung ins
   * Leere.
   */
  onSave?: (next: string | null) => void;
  label: string;
  emptyLabel?: string;
  multiline?: boolean;
  placeholder?: string;
  saving?: boolean;
  className?: string;
  inputClassName?: string;
  /** Zeigt gleich das Eingabefeld — ohne den Umweg über den Stift. */
  startOpen?: boolean;
  /**
   * Wird gerufen, wenn das Feld ohne Inhalt geschlossen wird — verworfen oder
   * leer gespeichert. Wer es gerade erst angelegt hat, nimmt es damit wieder
   * weg; wer den letzten Satz gelöscht hat, ebenso.
   */
  onDiscard?: () => void;
  /**
   * Statt des Stifts ein Textknopf mit diesem Wort, unter dem Text.
   *
   * Für die langen Felder. Ein Bleistift neben einem Absatz Fließtext ist ein
   * Symbol, das man deuten muss, und er sitzt oben rechts — also am Anfang von
   * etwas, das man erst zu Ende liest. Ein Wort am Fuß steht da, wo man
   * ankommt, und sagt sich selbst.
   */
  editLabel?: string;
}) {
  const [editing, setEditing] = useState(startOpen);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const close = (next: string | null) => {
    setEditing(false);
    if (next === null) onDiscard?.();
  };

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : trimmed;
    close(next);
    if (next !== value) onSave?.(next);
  };

  if (editing) {
    const shared = {
      value: draft,
      placeholder,
      onChange: (event: { target: { value: string } }) =>
        setDraft(event.target.value),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
          setDraft(value ?? '');
          close(value);
        }
        if (event.key === 'Enter' && !multiline) commit();
      },
    };

    return (
      <div className={cn('space-y-2', className)}>
        {multiline ? (
          <TextArea
            ref={inputRef as React.Ref<HTMLTextAreaElement>}
            className={inputClassName}
            {...shared}
          />
        ) : (
          <TextInput
            ref={inputRef as React.Ref<HTMLInputElement>}
            className={inputClassName}
            {...shared}
          />
        )}
        <div className="flex justify-end gap-1">
          <IconButton
            label="Verwerfen"
            onClick={() => {
              setDraft(value ?? '');
              close(value);
            }}
          >
            <X size={16} />
          </IconButton>
          <IconButton
            label="Speichern"
            onClick={commit}
            className="text-terracotta-600"
          >
            <Check size={16} />
          </IconButton>
        </div>
      </div>
    );
  }

  const text = (
    <p
      className={cn(
        'text-sm leading-relaxed whitespace-pre-line',
        value ? 'text-stone-700' : 'text-stone-400 italic',
        className,
      )}
    >
      {value ?? emptyLabel}
    </p>
  );

  if (editLabel) {
    return (
      <div className={cn('flex flex-col gap-3', className)}>
        {text}
        {onSave && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={saving}
            className={cn(
              'self-end text-xs font-bold text-terracotta-600 disabled:opacity-50',
              PRESSABLE,
            )}
          >
            {editLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn('group flex items-start justify-between gap-3', className)}
    >
      {text}
      {onSave && (
        <IconButton
          label={`${label} bearbeiten`}
          onClick={() => setEditing(true)}
          disabled={saving}
          className="shrink-0"
        >
          <Pencil size={14} />
        </IconButton>
      )}
    </div>
  );
}
