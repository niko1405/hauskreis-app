'use client';

/**
 * Die Zeile unter der Kapsel des Archivs — „Meine | Alle" bei Themen und
 * Liedern, „Zuhause | Treffpunkte" bei den Orten, rechts daneben Platz für
 * einen Knopf (die Sortierung der Lieder).
 *
 * **Kleine Pillen und keine zweite Kapsel**: Darüber stehen schon die
 * Kategorien als Kapsel, und zwei gleich aussehende Leisten übereinander liest
 * man als eine. Die gewählte Pille ist umrandet und hell, die andere nur Text —
 * sie verfeinert, was darüber gewählt ist, und tritt deshalb zurück.
 *
 * Ein Haarstrich darunter über die volle Breite trennt die Bedienung von der
 * Liste. Er reicht mit `-mx-5` bis an den Rand, wie die Seite selbst.
 */
import { useId } from 'react';
import { PRESSABLE } from '@/components/ui/button';
import { GlidePill } from '@/components/ui/glide-pill';
import { cn } from '@/lib/cn';

export function ListFilter<Value extends string>({
  label,
  value,
  onChange,
  options,
  action,
}: {
  /** Wofür die Gruppe steht, für Screenreader. */
  label: string;
  value: Value;
  onChange: (value: Value) => void;
  options: { value: Value; label: string; count?: number }[];
  /** Rechts in derselben Zeile, etwa die Sortierung. */
  action?: React.ReactNode;
}) {
  const pill = useId();

  return (
    <div className="-mx-5 flex items-center justify-between gap-3 border-b border-line px-5 pb-3">
      <div
        role="tablist"
        aria-label={label}
        className="relative flex items-center gap-1"
      >
        {/* Die helle Fläche gleitet zur neuen Wahl (`GlidePill`). */}
        <GlidePill
          group={pill}
          active={value}
          className="rounded-full border border-line-strong bg-card shadow-sm"
        />
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              data-glide={active ? pill : undefined}
              onClick={() => onChange(option.value)}
              className={cn(
                'relative rounded-full border border-transparent px-3 py-1 text-[13px] font-semibold transition-colors',
                PRESSABLE,
                active
                  ? 'text-stone-800'
                  : 'text-stone-400 hover:text-stone-600',
              )}
            >
              <span className="relative inline-flex items-center gap-1.5">
                {option.label}
                {/* Ohne Klammern: Die Zahl gehört zum Wort, wie in der Kapsel
                    darüber. */}
                {option.count !== undefined && (
                  <span className="text-[11px] font-medium opacity-60">
                    {option.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {action}
    </div>
  );
}
