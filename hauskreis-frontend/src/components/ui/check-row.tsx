'use client';

/**
 * Eine Angabe in einem Formular als Häkchen — die Bausteine eines Termins,
 * „Besonderer Termin", die Einstellungen der Verwaltung.
 *
 * Ein Häkchen und kein Schalter, weil es zu einem Formular gehört und erst mit
 * dessen Speichern gilt (`switch.tsx`). Darunter steht höchstens ein kurzer
 * Satz; was es dazu sonst noch zu wissen gibt, liegt hinter dem (i).
 *
 * **Drei Labels statt eines umschließenden.** Kästchen, Titel und Satz sind
 * je ein `<label htmlFor>`, das (i) steht daneben und nicht darin: Ein Tipp in
 * seine Blase hakte sonst nebenbei das Kästchen an, zu dem sie gehört.
 */
import { Check } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { InfoTip } from './info-tip';

export function CheckRow({
  label,
  hint,
  info,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  /** Die Einzelheiten — hinter einem (i) neben dem Label. */
  info?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  const pointer = disabled ? 'cursor-default' : 'cursor-pointer';

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg p-2 hover:bg-shell',
        disabled && 'opacity-60',
      )}
    >
      {/* **Das Kästchen ist gezeichnet, nicht das des Browsers.** Über
          `accent-color` bekommt man einen Haken in Terracotta, aber Form,
          Rundung und Größe bleiben die des Systems — und die sehen auf iOS,
          Android und im Fenster dreierlei aus. Der Eingabeknoten bleibt
          trotzdem der echte: er trägt Tastatur, Fokus und Screenreader, das
          Label daneben trägt nur das Bild. */}
      <input
        id={id}
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        aria-hidden
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
          'border-line-strong bg-card text-transparent',
          'peer-checked:border-terracotta-500 peer-checked:bg-terracotta-500 peer-checked:text-white',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-terracotta-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card',
          pointer,
        )}
      >
        <Check size={13} strokeWidth={3} />
      </label>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <label
            htmlFor={id}
            className={cn('text-sm font-bold text-stone-800', pointer)}
          >
            {label}
          </label>
          {info && <InfoTip label={label}>{info}</InfoTip>}
        </span>
        {hint && (
          <label
            htmlFor={id}
            className={cn(
              'block text-[11px] leading-relaxed text-stone-400',
              pointer,
            )}
          >
            {hint}
          </label>
        )}
      </span>
    </div>
  );
}
