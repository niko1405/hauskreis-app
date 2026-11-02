'use client';

/**
 * Zwei oder drei Ansichten derselben Sache, von denen genau eine gilt —
 * „Text | Akkorde" auf der Liedseite, im Editor und im Vollbild.
 *
 * Ein Schalter und nicht zwei Knöpfe: Es ist eine Frage mit mehreren
 * Antworten, dieselbe Überlegung wie bei den Antworten auf der Terminkarte.
 *
 * Mit `icon` steht auf dem Telefon nur das Symbol und ab `sm` das Wort
 * daneben — wie bei den Antwort-Knöpfen im Kalender. Das Wort bleibt für
 * Screenreader stehen.
 *
 * `iconOnly` lässt das Wort auch am Rechner weg; es steht dann als Tooltip
 * und für Screenreader da — für Umschalter, die neben einem Suchfeld wenig
 * Platz haben (Terminliste).
 *
 * `fill` streckt ihn über die volle Breite — für ein Formular, in dem er ein
 * Feld ist und kein Umschalter neben einer Überschrift. Die Knöpfe teilen sich
 * den Platz nach ihrem Inhalt (`flex-auto`), nicht zu gleichen Teilen: Bei
 * fünf Stufen wäre „Normal" sonst so breit wie „Oft".
 */
import { cn } from '@/lib/cn';

export function Segmented<Value extends string>({
  value,
  onChange,
  options,
  size = 'md',
  label,
  fill = false,
  iconOnly = false,
}: {
  value: Value;
  onChange: (value: Value) => void;
  options: { value: Value; label: string; icon?: React.ReactNode }[];
  size?: 'sm' | 'md';
  /** Wofür die Gruppe steht, für Screenreader. */
  label?: string;
  fill?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'flex rounded-full border border-line bg-card p-0.5',
        fill ? 'w-full' : 'shrink-0',
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={iconOnly ? option.label : undefined}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors',
            fill && 'flex-auto justify-center',
            size === 'sm'
              ? cn('py-1 text-xs', fill ? 'px-2 sm:px-3' : 'px-3')
              : 'px-4 py-1.5 text-sm',
            value === option.value
              ? 'bg-terracotta-500 text-white'
              : 'text-stone-500 hover:text-stone-700',
          )}
        >
          {option.icon}
          {option.icon ? (
            <span className={cn('sr-only', !iconOnly && 'sm:not-sr-only')}>
              {option.label}
            </span>
          ) : (
            option.label
          )}
        </button>
      ))}
    </div>
  );
}
