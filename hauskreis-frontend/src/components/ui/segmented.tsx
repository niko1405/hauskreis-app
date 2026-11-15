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
 *
 * `equal` teilt die volle Breite dagegen **gleich** auf — für Register, die
 * eine ganze Seite umschalten („Übersicht | Planung | Geburtstage"): Dort sind
 * die Teile gleichrangig, und gleich breit sehen sie auch so aus. `size="lg"`
 * gibt der Kapsel etwas Luft um die gewählte Pille, ohne sie zu einem Balken
 * zu machen: halbfett und nicht fett — sie ist Bedienung, keine Überschrift.
 *
 * `count` steht klein hinter dem Wort („Lieder 3"), für Register, hinter denen
 * eine Liste liegt. Ohne Zahl steht nichts — „Orte 0" wäre keine Auskunft.
 *
 * Die gewählte Fläche **gleitet** zur neuen Wahl (`GlidePill`), wie die
 * Pille in der Tab-Leiste.
 *
 * **Drei Arten, die Wahl zu zeigen** (`look`):
 *
 * - `solid` — gefüllt in Terracotta. Für Umschalter, die selbst die Frage
 *   sind („Text | Akkorde").
 * - `glow` — fast die Fläche des Behälters, abgehoben durch einen zarten
 *   Terracotta-Rahmen, einen Hauch Schein und farbige Schrift. Für die
 *   Register ganz oben auf einer Seite („Übersicht | Planung | Geburtstage"):
 *   Sie sind Bedienung, keine Überschrift, und eine gefüllte Fläche dort war
 *   das Lauteste auf dem Bildschirm.
 * - `quiet` — derselbe Rahmen wie `glow`, aber neutral: Rand, ein Hauch Fläche,
 *   dunklere Schrift, kein Terracotta. Für den kleinen Umschalter neben einem
 *   großen („Kommende | Vergangene" unter den Registern): Zwei farbige
 *   Wahlen übereinander fragten, welche die Seite bestimmt.
 * - `raised` — eine neutrale, leicht erhabene Fläche wie in iOS; nur das
 *   Symbol ist farbig. Für die Wahl zwischen zwei Wegen, unter der noch ein
 *   Knopf in Terracotta steht („Per Link | Per E-Mail").
 *
 * `shape="soft"` macht aus der Kapsel einen Kasten mit weichen Ecken und
 * etwas mehr Höhe, `surface="inset"` legt ihn vertieft in ein Sheet.
 * `labels="always"` lässt das Wort neben dem Symbol auch auf dem Telefon
 * stehen.
 */
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { GlidePill } from './glide-pill';

const PILL_LOOK = {
  solid: 'bg-terracotta-500',
  glow: 'border border-terracotta-500/50 bg-terracotta-500/10 shadow-[0_0_18px_-8px_var(--color-terracotta-500)]',
  quiet: 'border border-line-strong bg-stone-500/10',
  raised: 'border border-line-strong bg-card shadow-sm',
} as const;

const TEXT_LOOK = {
  solid: 'text-white',
  glow: 'text-terracotta-600',
  quiet: 'text-stone-800',
  raised: 'text-stone-900',
} as const;

export function Segmented<Value extends string>({
  value,
  onChange,
  options,
  size = 'md',
  label,
  fill = false,
  equal = false,
  iconOnly = false,
  look = 'solid',
  shape = 'pill',
  surface = 'card',
  labels = 'responsive',
}: {
  value: Value;
  onChange: (value: Value) => void;
  options: {
    value: Value;
    label: string;
    icon?: React.ReactNode;
    count?: number;
  }[];
  size?: 'sm' | 'md' | 'lg';
  /** Wofür die Gruppe steht, für Screenreader. */
  label?: string;
  fill?: boolean;
  equal?: boolean;
  iconOnly?: boolean;
  look?: keyof typeof PILL_LOOK;
  shape?: 'pill' | 'soft';
  surface?: 'card' | 'inset';
  labels?: 'responsive' | 'always';
}) {
  const pill = useId();
  const soft = shape === 'soft';

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'flex border border-line',
        surface === 'inset' ? 'bg-shell' : 'bg-card',
        soft ? 'rounded-2xl p-1' : 'rounded-full',
        !soft && (size === 'lg' ? 'p-1' : 'p-0.5'),
        fill || equal ? 'w-full' : 'shrink-0',
      )}
    >
      {options.map((option) => {
        const chosen = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={chosen}
            title={iconOnly ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex items-center font-semibold transition-colors',
              soft ? 'rounded-xl' : 'rounded-full',
              fill && 'flex-auto justify-center',
              equal && 'min-w-0 flex-1 justify-center',
              size === 'sm'
                ? cn('py-1 text-xs', fill ? 'px-2 sm:px-3' : 'px-3')
                : size === 'lg'
                  ? cn('px-2 text-[13px]', soft ? 'py-2.5' : 'py-1.5')
                  : cn('px-4 text-sm', soft ? 'py-2' : 'py-1.5'),
              chosen ? TEXT_LOOK[look] : 'text-stone-500 hover:text-stone-700',
            )}
          >
            {chosen && (
              <GlidePill
                id={pill}
                radius={soft ? 12 : 9999}
                className={cn('inset-0', PILL_LOOK[look])}
              />
            )}
            <span className="relative inline-flex min-w-0 items-center gap-1.5">
              {option.icon && (
                // Bei `glow` und `raised` trägt das Symbol der Wahl die Farbe
                // — bei `raised` ist es das Einzige, was farbig ist. `quiet`
                // bleibt ganz ohne.
                <span
                  className={cn(
                    'inline-flex shrink-0',
                    chosen &&
                      (look === 'glow' || look === 'raised') &&
                      'text-terracotta-500',
                  )}
                >
                  {option.icon}
                </span>
              )}
              {option.icon && labels === 'responsive' ? (
                <span className={cn('sr-only', !iconOnly && 'sm:not-sr-only')}>
                  {option.label}
                </span>
              ) : (
                <span className="truncate">{option.label}</span>
              )}
              {option.count !== undefined && (
                <span className="-ml-0.5 shrink-0 text-[11px] opacity-70">
                  {option.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
