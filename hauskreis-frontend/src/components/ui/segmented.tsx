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
 */
import { cn } from '@/lib/cn';

export function Segmented<Value extends string>({
  value,
  onChange,
  options,
  size = 'md',
  label,
}: {
  value: Value;
  onChange: (value: Value) => void;
  options: { value: Value; label: string; icon?: React.ReactNode }[];
  size?: 'sm' | 'md';
  /** Wofür die Gruppe steht, für Screenreader. */
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex shrink-0 rounded-full border border-line bg-card p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors',
            size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',
            value === option.value
              ? 'bg-terracotta-500 text-white'
              : 'text-stone-500 hover:text-stone-700',
          )}
        >
          {option.icon}
          {option.icon ? (
            <span className="sr-only sm:not-sr-only">{option.label}</span>
          ) : (
            option.label
          )}
        </button>
      ))}
    </div>
  );
}
