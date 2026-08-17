'use client';

/**
 * Hell, dunkel oder wie das Gerät.
 *
 * Drei Knöpfe nebeneinander statt eines Schalters: Ein Schalter kann nur zwei
 * Zustände, und „System" ist hier keine Randnotiz, sondern die Voreinstellung
 * — die App wechselt dann abends von selbst mit.
 *
 * Steht weit oben im Profil und nicht bei den Kontosachen: Es ist die einzige
 * Einstellung auf diesem Bildschirm, die man sofort sieht, und die einzige,
 * die nur für dieses Gerät gilt.
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import { Card, SectionTitle } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { useTheme, type Theme } from '@/lib/theme';

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Hell', icon: Sun },
  { value: 'dark', label: 'Dunkel', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();

  return (
    <section>
      <SectionTitle>Darstellung</SectionTitle>
      <Card className="space-y-2">
        <div
          role="radiogroup"
          aria-label="Darstellung"
          className="flex gap-1.5 rounded-md bg-stone-100 p-1"
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = theme === value;

            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-sm py-2 text-xs font-semibold transition-colors',
                  active
                    ? 'bg-card text-stone-800 shadow-sm'
                    : 'text-stone-500 hover:text-stone-700',
                )}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-stone-400">
          Gilt nur auf diesem Gerät. „System" folgt der Einstellung deines
          Smartphones oder Rechners.
        </p>
      </Card>
    </section>
  );
}
