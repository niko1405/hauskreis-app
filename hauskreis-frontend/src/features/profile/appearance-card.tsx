'use client';

/**
 * Hell, dunkel oder wie das Gerät.
 *
 * Drei Knöpfe nebeneinander statt eines Schalters: Ein Schalter kann nur zwei
 * Zustände, und „System" ist hier keine Randnotiz, sondern die Voreinstellung
 * — die App wechselt dann abends von selbst mit.
 *
 * Darunter steht seit Neuestem der Schalter für die **Kopfleiste**. Er gehört
 * hierher, weil er dieselbe Sorte Einstellung ist: eine Aussage über diesen
 * Bildschirm, nicht über diese Person — und wie das Thema liegt er im Gerät.
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import { Card, SectionTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { useHeaderPreference } from '@/lib/header-preference';
import { useTheme, type Theme } from '@/lib/theme';

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Hell', icon: Sun },
  { value: 'dark', label: 'Dunkel', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const header = useHeaderPreference();

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

        {/* Auch eine Sache des Geräts und deshalb hier: Die Leiste ist ein
            Kompromiss — sie trägt den Weg zur Gruppe und die Glocke, liegt
            dafür aber über den Kopfbildern. Wer sie nicht will, findet beides
            danach im Profil. */}
        <div className="border-t border-line pt-3">
          <Checkbox
            label="Kopfleiste anzeigen"
            description="Die Leiste über den Tabs mit Gruppenbild, „Gruppe“ und Glocke. Ohne sie erreichst du die Gruppe über dein Profil."
            checked={header.shown}
            onChange={(event) => header.setShown(event.target.checked)}
          />
        </div>
      </Card>
    </section>
  );
}
